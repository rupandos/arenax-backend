import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { cacheDeletePattern, cacheGet, cacheSet } from '../../lib/cache';
import { NotFoundError, ConflictError, ForbiddenError, AppError } from '../../utils/errors';
import { logger } from '../../lib/logger';
import { emitToUser } from '../../sockets/emitter';

const LISTINGS_CACHE_TTL_SECONDS = 30;

function listingsCacheKey(status: string | undefined, page: number, pageSize: number): string {
  return `marketplace:listings:${status ?? 'ALL'}:${page}:${pageSize}`;
}

export async function listAsset(userId: string, assetId: string, price: number): Promise<void> {
  if (price <= 0 || price > 1_000_000_000) {
    throw new AppError(400, 'INVALID_PRICE', 'Price must be between 1 and 1,000,000,000');
  }

  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) {
    throw new NotFoundError('ASSET_NOT_FOUND', 'Asset does not exist');
  }
  if (asset.ownerId !== userId) {
    throw new ForbiddenError('NOT_OWNER', 'You can only list assets you own');
  }

  const existing = await prisma.listing.findUnique({ where: { assetId } });
  if (existing && existing.status === 'ACTIVE') {
    throw new ConflictError('ALREADY_LISTED', 'Asset is already listed for sale');
  }

  await prisma.listing.upsert({
    where: { assetId },
    update: { sellerId: userId, price, status: 'ACTIVE', closedAt: null },
    create: { assetId, sellerId: userId, price, status: 'ACTIVE' },
  });

  await cacheDeletePattern('marketplace:listings:*');
  logger.info({ assetId, userId, price }, 'asset listed');
}

export async function getListings(filters: { status?: string; page: number; pageSize: number }) {
  const cacheKey = listingsCacheKey(filters.status, filters.page, filters.pageSize);
  const cached = await cacheGet<{ items: unknown[]; total: number }>(cacheKey);
  if (cached) {
    return cached;
  }

  const where: Prisma.ListingWhereInput = filters.status
    ? { status: filters.status as 'ACTIVE' | 'SOLD' | 'CANCELLED' }
    : {};

  const [items, total] = await Promise.all([
    prisma.listing.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      include: {
        asset: { select: { id: true, tokenId: true, name: true, rarity: true } },
        seller: { select: { id: true, username: true } },
      },
    }),
    prisma.listing.count({ where }),
  ]);

  const result = { items, total };
  await cacheSet(cacheKey, result, { ttlSeconds: LISTINGS_CACHE_TTL_SECONDS });
  return result;
}

export async function cancelListing(userId: string, listingId: string): Promise<void> {
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) {
    throw new NotFoundError('LISTING_NOT_FOUND', 'Listing does not exist');
  }
  if (listing.sellerId !== userId) {
    throw new ForbiddenError('NOT_OWNER', 'Only the seller can cancel a listing');
  }
  if (listing.status !== 'ACTIVE') {
    throw new ConflictError('LISTING_NOT_ACTIVE', 'Listing is no longer active');
  }

  await prisma.listing.update({
    where: { id: listingId },
    data: { status: 'CANCELLED', closedAt: new Date() },
  });
  await cacheDeletePattern('marketplace:listings:*');
}

export function priceInCurrency(listing: { price: number; currency: string }): string {
  return `${listing.price} ${listing.currency}`;
}

export async function purchaseListing(buyerId: string, listingId: string, idempotencyKey: string) {
  const existing = await prisma.transaction.findFirst({ where: { idempotencyKey } });
  if (existing) {
    logger.info({ idempotencyKey, transactionId: existing.id }, 'duplicate purchase attempt, returning prior result');
    return { transaction: existing, duplicate: true };
  }

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { asset: true, seller: true },
  });
  if (!listing) {
    throw new NotFoundError('LISTING_NOT_FOUND', 'Listing does not exist');
  }
  if (listing.status !== 'ACTIVE') {
    throw new ConflictError('LISTING_NOT_ACTIVE', 'Listing is no longer active');
  }
  if (listing.sellerId === buyerId) {
    throw new AppError(400, 'SELF_PURCHASE', 'You cannot purchase your own listing');
  }

  const transaction = await prisma.$transaction(async (tx) => {
    const claimed = await tx.listing.updateMany({
      where: { id: listingId, status: 'ACTIVE' },
      data: { status: 'SOLD', closedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new ConflictError('LISTING_NOT_ACTIVE', 'Listing was already purchased');
    }

    const txRecord = await tx.transaction.create({
      data: {
        listingId,
        buyerId,
        sellerId: listing.sellerId,
        assetId: listing.assetId,
        amount: listing.price,
        currency: listing.currency,
        status: 'CONFIRMED',
        idempotencyKey,
      },
    });

    await tx.asset.update({
      where: { id: listing.assetId },
      data: { ownerId: buyerId },
    });

    await tx.assetTransfer.create({
      data: {
        assetId: listing.assetId,
        fromUserId: listing.sellerId,
        toUserId: buyerId,
        reason: 'MARKETPLACE_PURCHASE',
      },
    });

    return txRecord;
  });

  emitToUser(buyerId, 'marketplace:purchased', {
    transactionId: transaction.id,
    assetId: listing.assetId,
    assetName: listing.asset.name,
    price: listing.price,
    currency: listing.currency,
  });
  emitToUser(listing.sellerId, 'marketplace:sold', {
    transactionId: transaction.id,
    assetId: listing.assetId,
    price: listing.price,
    currency: listing.currency,
  });

  await prisma.notification.create({
    data: {
      userId: listing.sellerId,
      type: 'MARKETPLACE_SOLD',
      title: 'Asset sold',
      body: `Your ${listing.asset.name} was sold for ${listing.price} ${listing.currency}`,
      data: { transactionId: transaction.id, assetId: listing.assetId },
    },
  });

  logger.info({ transactionId: transaction.id, listingId, buyerId }, 'marketplace purchase completed');
  await cacheDeletePattern('marketplace:listings:*');
  return { transaction, duplicate: false };
}

export async function getUserInventory(userId: string, page: number, pageSize: number) {
  const [items, total] = await Promise.all([
    prisma.asset.findMany({
      where: { ownerId: userId },
      orderBy: { mintedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        listings: { where: { status: 'ACTIVE' }, select: { id: true, price: true, status: true } },
      },
    }),
    prisma.asset.count({ where: { ownerId: userId } }),
  ]);

  return {
    items: items.map((asset) => ({
      id: asset.id,
      tokenId: asset.tokenId,
      name: asset.name,
      rarity: asset.rarity,
      mintedAt: asset.mintedAt,
      listed: asset.listings.length > 0,
      activeListing: asset.listings[0] ?? null,
    })),
    total,
  };
}

export { emitToUser };

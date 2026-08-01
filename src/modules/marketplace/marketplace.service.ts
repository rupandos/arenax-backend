import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { NotFoundError, ConflictError, ForbiddenError, AppError } from '../../utils/errors';
import { logger } from '../../lib/logger';
import { emitToUser } from '../../sockets/emitter';

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

  logger.info({ assetId, userId, price }, 'asset listed');
}

export async function getListings(filters: { status?: string; page: number; pageSize: number }) {
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

  return { items, total };
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
}

export function priceInCurrency(listing: { price: number; currency: string }): string {
  return `${listing.price} ${listing.currency}`;
}

export { emitToUser };

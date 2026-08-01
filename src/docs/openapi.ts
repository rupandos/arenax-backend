export const openapiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'ArenaX Backend API',
    version: '0.1.0',
    description:
      'Production game backend: wallet authentication, tournaments, reward distribution, leaderboards, marketplace, and real-time notifications.',
  },
  servers: [{ url: '/' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              details: {},
            },
          },
        },
      },
      WalletChallengeRequest: {
        type: 'object',
        required: ['walletAddress'],
        properties: { walletAddress: { type: 'string' } },
      },
      WalletChallengeResponse: {
        type: 'object',
        properties: {
          data: {
            type: 'object',
            properties: {
              nonce: { type: 'string' },
              message: { type: 'string', description: 'Message to sign with the wallet' },
            },
          },
        },
      },
      WalletVerifyRequest: {
        type: 'object',
        required: ['walletAddress', 'publicKey', 'signature', 'nonce'],
        properties: {
          walletAddress: { type: 'string' },
          publicKey: { type: 'string', description: 'Base64-encoded 32-byte public key' },
          signature: { type: 'string', description: 'Base64-encoded 64-byte Ed25519 signature' },
          nonce: { type: 'string' },
        },
      },
      TokenPair: {
        type: 'object',
        properties: {
          accessToken: { type: 'string' },
          refreshToken: { type: 'string' },
          expiresIn: { type: 'integer' },
        },
      },
      Tournament: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          status: { type: 'string', enum: ['DRAFT', 'OPEN', 'STARTED', 'COMPLETED', 'CANCELLED'] },
          startTime: { type: 'string', format: 'date-time' },
          endTime: { type: 'string', format: 'date-time' },
          entryFee: { type: 'integer' },
          prizePool: { type: 'integer' },
          maxPlayers: { type: 'integer' },
        },
      },
      Reward: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          type: { type: 'string', enum: ['TOURNAMENT_PRIZE', 'NFT_REWARD', 'SIGNUP_BONUS', 'REFERRAL_BONUS'] },
          amount: { type: 'integer' },
          currency: { type: 'string' },
          status: { type: 'string', enum: ['PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED'] },
          attemptCount: { type: 'integer' },
          lastError: { type: 'string', nullable: true },
        },
      },
      LeaderboardEntry: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          username: { type: 'string' },
          points: { type: 'integer' },
          rank: { type: 'integer' },
        },
      },
      Listing: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          asset: { type: 'object', properties: { name: { type: 'string' }, rarity: { type: 'string' } } },
          price: { type: 'integer' },
          currency: { type: 'string' },
          status: { type: 'string', enum: ['ACTIVE', 'SOLD', 'CANCELLED'] },
        },
      },
      Notification: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          type: { type: 'string' },
          title: { type: 'string' },
          body: { type: 'string' },
          readAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: { summary: 'Service overview', tags: ['Health'], responses: { '200': { description: 'OK' } } },
    },
    '/health/live': {
      get: { summary: 'Liveness probe', tags: ['Health'], responses: { '200': { description: 'OK' } } },
    },
    '/health/ready': {
      get: {
        summary: 'Readiness probe (checks Postgres and Redis)',
        tags: ['Health'],
        responses: { '200': { description: 'Ready' }, '503': { description: 'Degraded' } },
      },
    },
    '/api/auth/wallet/challenge': {
      post: {
        summary: 'Request a signing challenge for wallet login',
        tags: ['Authentication'],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/WalletChallengeRequest' } } } },
        responses: {
          '200': { description: 'Challenge issued', content: { 'application/json': { schema: { $ref: '#/components/schemas/WalletChallengeResponse' } } } },
          '429': { description: 'Rate limited' },
        },
      },
    },
    '/api/auth/wallet/verify': {
      post: {
        summary: 'Verify wallet signature and obtain tokens',
        tags: ['Authentication'],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/WalletVerifyRequest' } } } },
        responses: {
          '201': {
            description: 'Authenticated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/TokenPair' } } },
          },
          '401': { description: 'Invalid signature or nonce' },
        },
      },
    },
    '/api/auth/refresh': {
      post: {
        summary: 'Rotate refresh token and issue a new access token',
        tags: ['Authentication'],
        responses: { '200': { description: 'New token pair' }, '401': { description: 'Invalid or revoked token' } },
      },
    },
    '/api/auth/logout': {
      post: {
        summary: 'Revoke the refresh token session',
        tags: ['Authentication'],
        responses: { '200': { description: 'Logged out' } },
      },
    },
    '/api/users/me': {
      get: {
        summary: 'Get own profile with stats',
        tags: ['Users'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Profile' } },
      },
      patch: {
        summary: 'Update own profile (username, avatarUrl)',
        tags: ['Users'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Updated profile' } },
      },
    },
    '/api/users/{id}': {
      get: {
        summary: 'Get a public profile',
        tags: ['Users'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Public profile' } },
      },
    },
    '/api/tournaments': {
      get: {
        summary: 'List tournaments (filter by status)',
        tags: ['Tournaments'],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['DRAFT', 'OPEN', 'STARTED', 'COMPLETED', 'CANCELLED'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: { '200': { description: 'Paginated tournaments' } },
      },
      post: {
        summary: 'Create a tournament (admin)',
        tags: ['Tournaments'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Created' }, '403': { description: 'Admin only' } },
      },
    },
    '/api/tournaments/{id}': {
      get: {
        summary: 'Get tournament details with players',
        tags: ['Tournaments'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Tournament', content: { 'application/json': { schema: { $ref: '#/components/schemas/Tournament' } } } } },
      },
      patch: {
        summary: 'Update a tournament',
        tags: ['Tournaments'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Updated' } },
      },
    },
    '/api/tournaments/{id}/join': {
      post: {
        summary: 'Register for a tournament',
        tags: ['Tournaments'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '201': { description: 'Registered' }, '409': { description: 'Not open or full' } },
      },
    },
    '/api/tournaments/{id}/leave': {
      post: {
        summary: 'Withdraw from a tournament',
        tags: ['Tournaments'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Withdrawn' } },
      },
    },
    '/api/tournaments/{id}/matchmaking/join': {
      post: {
        summary: 'Enter matchmaking queue for a live tournament',
        tags: ['Tournaments'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Queued' } },
      },
    },
    '/api/matches/{id}/result': {
      post: {
        summary: 'Report a match result',
        tags: ['Tournaments'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Result recorded' } },
      },
    },
    '/api/leaderboard/top': {
      get: {
        summary: 'Get top leaderboard entries',
        tags: ['Leaderboard'],
        parameters: [
          { name: 'period', in: 'query', schema: { type: 'string', enum: ['daily', 'weekly'], default: 'daily' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10, maximum: 100 } },
        ],
        responses: { '200': { description: 'Top entries', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/LeaderboardEntry' } } } } } },
      },
    },
    '/api/leaderboard/me': {
      get: {
        summary: 'Get own rank and points',
        tags: ['Leaderboard'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Rank info' } },
      },
    },
    '/api/rewards': {
      get: {
        summary: 'List own rewards',
        tags: ['Rewards'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Paginated rewards', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Reward' } } } } } },
      },
    },
    '/api/rewards/{id}': {
      get: {
        summary: 'Get reward details',
        tags: ['Rewards'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Reward' } },
      },
    },
    '/api/rewards/{id}/retry': {
      post: {
        summary: 'Retry a failed reward',
        tags: ['Rewards'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Requeued' } },
      },
    },
    '/api/rewards/{id}/nft-status': {
      get: {
        summary: 'Check NFT mint status for an NFT reward',
        tags: ['Rewards'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Mint status' } },
      },
    },
    '/api/marketplace/listings': {
      get: {
        summary: 'List marketplace listings',
        tags: ['Marketplace'],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['ACTIVE', 'SOLD', 'CANCELLED'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: { '200': { description: 'Paginated listings', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Listing' } } } } } },
      },
      post: {
        summary: 'List an owned asset for sale',
        tags: ['Marketplace'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Listed' } },
      },
    },
    '/api/marketplace/listings/{id}/purchase': {
      post: {
        summary: 'Purchase a listing (idempotent via idempotencyKey)',
        tags: ['Marketplace'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Purchased' } },
      },
    },
    '/api/marketplace/inventory': {
      get: {
        summary: 'Get own asset inventory',
        tags: ['Marketplace'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Paginated inventory' } },
      },
    },
    '/api/notifications': {
      get: {
        summary: 'List own notifications',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Paginated notifications', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Notification' } } } } } },
      },
    },
    '/api/notifications/unread-count': {
      get: {
        summary: 'Unread notification count',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Count' } },
      },
    },
    '/api/notifications/read-all': {
      post: {
        summary: 'Mark all notifications as read',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Marked' } },
      },
    },
  },
} as const;

import { router } from './../../trpc/router';
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { protectedProcedure } from '@/server/trpc/procedures'
import {
  NonEmptyStringSchema,
  CountSchema,
  IdSchema,
} from '@/utils/server/base-schemas'
import { Kysely } from 'kysely';
import type { DB } from '../../db/types';

export const myFriendRouter = router({
  getById: protectedProcedure
    .input(
      z.object({
        friendUserId: IdSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as Kysely<DB>;
      const totalFriendCountQuery = userTotalFriendCount(db);
      const mutualFriendCountResult = await mutualFriendCountQuery(db, ctx.session.userId, input.friendUserId)
        .executeTakeFirst();
      const friendInfo = await db
        .selectFrom('users as friends')
        .innerJoin('friendships', 'friendships.friendUserId', 'friends.id')
        .innerJoin(
          totalFriendCountQuery.as('userTotalFriendCount'),
          'userTotalFriendCount.userId',
          'friends.id'
        )
        .where('friendships.userId', '=', ctx.session.userId)
        .where('friendships.friendUserId', '=', input.friendUserId)
        .where('friendships.status', '=', 'accepted')
        .select([
          'friends.id',
          'friends.fullName',
          'friends.phoneNumber',
          'userTotalFriendCount.totalFriendCount',
          db.selectFrom('friendships as f1')
            .innerJoin('friendships as f2', 'f1.friendUserId', 'f2.friendUserId')
            .where('f1.userId', '=', ctx.session.userId)
            .where('f2.userId', '=', input.friendUserId)
            .where('f1.status', '=', 'accepted')
            .where('f2.status', '=', 'accepted')
            .select((eb) => [
              eb.fn.count('f2.friendUserId').as('mutualFriendCount')
            ])
            .as('mutualFriendCountQuery')
        ])
        .executeTakeFirstOrThrow(() => new TRPCError({ code: 'NOT_FOUND' }));

      return z.object({
        id: IdSchema,
        fullName: NonEmptyStringSchema,
        phoneNumber: NonEmptyStringSchema,
        totalFriendCount: CountSchema,
        mutualFriendCount: CountSchema,
      }).parse({
        ...friendInfo,
        mutualFriendCount: mutualFriendCountResult?.mutualFriendCount || 0,
      });
    }),
})

const userTotalFriendCount = (db: Kysely<DB>) => {
  return db
    .selectFrom('friendships')
    .where('status', '=', 'accepted')
    .select((eb) => [
      'userId',
      eb.fn.count('friendUserId').as('totalFriendCount'),
    ])
    .groupBy('userId');
};

const mutualFriendCountQuery = (db: Kysely<DB>, userId: number, friendUserId: number) => {
  return db
    .selectFrom('friendships as f1')
    .innerJoin('friendships as f2', 'f1.friendUserId', 'f2.friendUserId')
    .where('f1.userId', '=', userId)
    .where('f2.userId', '=', friendUserId)
    .where('f1.status', '=', 'accepted')
    .where('f2.status', '=', 'accepted')
    .select((eb) => [
      eb.fn.count('f2.friendUserId').as('mutualFriendCount')
    ]);
};


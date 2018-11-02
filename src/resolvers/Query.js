// Custom resolver for queries
const {forwardTo} = require('prisma-binding');
const { checkPermissions, hasPermission, AppPermissions } = require('../utils');

const Query = {
    items: forwardTo('db'),
    orders: forwardTo('db'),
    item: forwardTo('db'),
    itemsConnection: forwardTo('db'),
    me(parent, args, ctx, info){
        if(!ctx.request.userId){
            return null;
        }
        return ctx.db.query.user({
            where: { id: ctx.request.userId }
        }, info);
    },
    async users(parent, args, ctx, info){
        if(!ctx.request.userId){
            throw new Error('You need to login!');
        }
        hasPermission(ctx.request.user,[AppPermissions.admin, AppPermissions.permissionUpdate]);

        return ctx.db.query.users({}, info);
    },
    async order(parent, args, ctx, info){
        if(!ctx.request.userId){
            throw new Error('You need to login!');
        }
        const order = await ctx.db.query.order({ where: {id: args.id} }, info);
        const ownsOrder = order.user.id === ctx.request.userId;
        const isAdmin = checkPermissions(ctx.request.user.permissions,[AppPermissions.admin,AppPermissions.orderUpdate]);
        if(!ownsOrder && !isAdmin){
            throw new Error('You don\'t have permission');
        }

        return order;
    },
    async ordersByUser(parent, args, ctx, info) {
        const { userId } = ctx.request;
        if (!userId) {
          throw new Error('you must be signed in!');
        }
        if (checkPermissions(ctx.request.user.permissions,[AppPermissions.admin, AppPermissions.orderUpdate])){
            return ctx.db.query.orders(
                {},
                info
              );
        }
        return ctx.db.query.orders(
          {
            where: {
              user: { id: userId },
            },
          },
          info
        );
      },
      async searchOrders(parent, args, ctx, info) {
        const { userId } = ctx.request;
        if (!userId) {
          throw new Error('you must be signed in!');
        }
        if (checkPermissions(ctx.request.user.permissions,[AppPermissions.admin, AppPermissions.orderUpdate])){
            return await ctx.db.query.orders({where:
                {
                    tracking_contains: args.searchTerm,
                },
                info
                });
        }

         return await ctx.db.query.orders({where:
          {
            AND: [
                { tracking_contains: args.searchTerm },
                { user: { id: userId } }
              ]
          },
          info
        });
      },
};

module.exports = Query;

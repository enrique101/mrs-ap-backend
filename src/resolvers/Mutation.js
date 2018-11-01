// Custom resolver for mutations
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomBytes } = require('crypto');
const { promisify } = require('util');
const { transport, makeANiceEmail, orderEmail } = require('../mail');
const { hasPermission, AppPermissions } = require('../utils');
const stripe = require('../stripe');

const generateJWT = (userId, res) => {
    const token = jwt.sign({ userId }, process.env.APP_SECRET);
    res.cookie('token', token, {
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 * 365,
    });
}

const Mutations = {
    async createItem(parent, args, ctx, info){
        if(!ctx.request.userId){
            throw new Error(`You need to login`);
        }
        hasPermission(ctx.request.user,[AppPermissions.admin, AppPermissions.itemCreate]);
        const item = await ctx.db.mutation.createItem({
            data:{
                user: {
                    connect: {
                        id: ctx.request.userId
                    }
                },
                ...args
            }
        }, info);
        return item;
    },

    async updateItem(parent, args, ctx, info){

        const updates = { ...args };
        delete updates.id;
        hasPermission(ctx.request.user,[AppPermissions.admin, AppPermissions.itemUpdate]);
        return await ctx.db.mutation.updateItem({
            data: updates,
            where:{
                id:args.id
            },
        } , info);
    },

    async deleteItem(parent, args, ctx, info){
        const where = { id:args.id },
              item = await ctx.db.query.item({ where }, `{id title user { id }}`);
        const ownsItem =  item.user.id === ctx.request.userId;
        ctx.request.user.permissions.some(permission => [AppPermissions.admin, AppPermissions.itemDelete].includes(permission));
        if(!ownsItem){
            throw new Error("You don't have permissions");
        }
        return ctx.db.mutation.deleteItem({ where }, info);
    },
    async confirmUser(parent, { id }, ctx, info){
      const user = await ctx.db.query.user({ where: { id } });
      if(!user || user.confirmed){
          throw new Error(`Invalid Operation`);
      }
      const res = await ctx.db.mutation.updateUser({
          where: { id },
          data: { confirmed: true }
      });
      const token = jwt.sign({ userId : user.id}, process.env.APP_SECRET);
        ctx.response.cookie('token', token, {
            httpOnly: true,
            maxAge: 1000 * 60 * 60 * 24 * 365,
        });
      return { message: "User confirmed"};
    },

    async signup(parent, args, ctx, info){
        args.email = args.email.toLowerCase();
        const where = {email:args.email},
              exist = await ctx.db.query.users({ where }, `{email}`);
        if(exist.length > 0) throw new Error(`Email already registered`);
        const password = await bcrypt.hash(args.password, 10);
        const user = await ctx.db.mutation.createUser({
            data:{
                ...args,
                password,
                permissions: { set: [] },
            },
        }, info);
        const mailRes = await transport.sendMail({
            from: 'enrique.acuna@gmail.com',
            to: user.email,
            subject: 'Confirma tu dirección de correo',
            html: makeANiceEmail(user.name,`<a href="${process.env.FRONTEND_URL}/confirm?id=${user.id}">Presiona aquí para confirmar tu correo.</a>`),
        });
        // const token = jwt.sign({ userId : user.id}, process.env.APP_SECRET);
        // ctx.response.cookie('token', token, {
        //     httpOnly: true,
        //     maxAge: 1000 * 60 * 60 * 24 * 365,
        // });
        return user;
    },
    async signin(parent, { email, password }, ctx, info){
        const user = await ctx.db.query.user({ where: { email } });
        if(!user){
            throw new Error(`Incorrect email or password`);
        }
        const isValid =  await bcrypt.compare(password,user.password);
        if(!isValid){
            throw new Error(`Incorrect email or password`);
        }
        const token = jwt.sign({ userId : user.id}, process.env.APP_SECRET);
        ctx.response.cookie('token', token, {
            httpOnly: true,
            maxAge: 1000 * 60 * 60 * 24 * 365,
        });
        return user;
    },

    signout(parent, args, ctx, info){
        ctx.response.clearCookie('token');
        return { message: "Good Bye!"};
    },
    async requestReset(parent, { email }, ctx, info){
        const user = await ctx.db.query.user({ where: { email } });
        if(!user){
            throw new Error(`No such user found for email ${email}`);
        }
        const resetToken = (await promisify(randomBytes)(20)).toString('hex');
        const resetTokenExpiry = Date.now() + 3600000;
        const res = await ctx.db.mutation.updateUser({
            where: { email },
            data: { resetToken,resetTokenExpiry }
        });
        const mailRes = await transport.sendMail({
            from: 'enrique.acuna@gmail.com',
            to: user.email,
            subject: 'Tu solicitud de restauración de acceso.',
            html: makeANiceEmail(user.name,`<a href="${process.env.FRONTEND_URL}/reset?resetToken=${resetToken}">Presiona aquí para restaurar tu cotraseña</a>`),
        });
        return { message: "Reset sent!"};
    },
    async resetPassword(parent, args, ctx, info) {
        // 1. check if the passwords match
        if (args.password !== args.confirmPassword) {
          throw new Error("Passwords don't match!");
        }
        // 2. check if its a legit reset token
        // 3. Check if its expired
        const [user] = await ctx.db.query.users({
          where: {
            resetToken: args.resetToken,
            resetTokenExpiry_gte: Date.now() - 3600000,
          },
        });
        if (!user) {
          throw new Error('This token is either invalid or expired!');
        }
        // 4. Hash their new password
        const password = await bcrypt.hash(args.password, 10);
        // 5. Save the new password to the user and remove old resetToken fields
        const updatedUser = await ctx.db.mutation.updateUser({
          where: { email: user.email },
          data: {
            password,
            resetToken: null,
            resetTokenExpiry: null,
          },
        });
        // 6. Generate JWT
        generateJWT(updatedUser.id,ctx.response);
        // 8. return the new user
        return updatedUser;
      },
      async updatePermissions(parent, args, ctx, info) {
        // 1. Check if they are logged in
        if (!ctx.request.userId) {
          throw new Error('You must be logged in!');
        }

        // 2. Query the current user
        const currentUser = await ctx.db.query.user(
          {
            where: {
              id: ctx.request.userId,
            },
          },
          info
        );
        // 3. Check if they have permissions to do this
        hasPermission(currentUser, [AppPermissions.admin, AppPermissions.permissionUpdate]);
        const isAdmin = currentUser.permissions.includes(AppPermissions.admin);
        const newPermissions = isAdmin ? args.permissions : args.permissions.filter(per => per === AppPermissions.user || per === AppPermissions.permissionUpdate);
        // 4. Update the permissions
        return ctx.db.mutation.updateUser(
          {
            data: {
              permissions: {
                set: newPermissions,
              },
            },
            where: {
              id: args.userId,
            },
          },
          info
        );
      },
      async addToCart(parent, args, ctx, info) {
          const { user, userId } = ctx.request;
          if (!userId) {
            throw new Error('You must be logged in!');
          }
          hasPermission(user,[AppPermissions.admin,AppPermissions.user]);
          const [existingCartItem] = await ctx.db.query.cartItems({
              where: {
                  user: { id: userId },
                  item: { id: args.id },
              }
          });
          if (existingCartItem) {
            return ctx.db.mutation.updateCartItem(
              {
                where: { id: existingCartItem.id },
                data: { quantity: existingCartItem.quantity + 1 },
              },
              info
            );
          }
          return await ctx.db.mutation.createCartItem({
              data:{
                user: {
                    connect:{ id: userId },
                },
                item: {
                    connect:{ id: args.id },
                },
              }
          }, info);
      },
      async removeFromCart(parent, args, ctx, info) {
        // 1. Find the cart item
        const cartItem = await ctx.db.query.cartItem(
          {
            where: {
              id: args.id,
            },
          },
          `{ id, user { id }}`
        );
        // 1.5 Make sure we found an item
        if (!cartItem) throw new Error('No CartItem Found!');
        // 2. Make sure they own that cart item
        if (cartItem.user.id !== ctx.request.userId) {
          throw new Error('Operation unallowed');
        }
        // 3. Delete that cart item
        return ctx.db.mutation.deleteCartItem(
          {
            where: { id: args.id },
          },
          info
        );
      },

      async updateOrderStatus(parent, args, ctx, info) {
        const { userId } = ctx.request;
        const { id, status } = args;
        console.log(args);
        if (!userId) throw new Error('You must be signed in.');
        return ctx.db.mutation.updateOrder(
          {
            where: { id },
            data: { status },
          },
          info
        );
      },

      async createOrderRequest(parent, args, ctx, info) {
        const { userId } = ctx.request;
        const { name:clientName, account:clientAccount } = args;
        if (!userId) throw new Error('You must be signed in to complete this order.');
        if (!clientName || !clientAccount || clientName.trim().length === 0 || clientAccount.trim().length === 0) throw new Error('Missing Information');
        const user = await ctx.db.query.user(
          { where: { id: userId } },
          `{
          id
          name
          email
          permissions
          cart {
            id
            quantity
            item { title price cost id description image largeImage }
          }}`
        );
        hasPermission(user,[AppPermissions.admin,AppPermissions.user]);

        const amount = user.cart.reduce(
          (tally, cartItem) => {
            tally.price = tally.price + cartItem.item.price * cartItem.quantity;
            tally.cost = tally.cost + cartItem.item.cost * cartItem.quantity;
            return tally;
          },
          {price: 0 , cost: 0}
        );

        const orderItems = user.cart.map(cartItem => {
          const orderItem = {
            ...cartItem.item,
            quantity: cartItem.quantity,
            user: { connect: { id: userId } },
          };
          delete orderItem.id;
          return orderItem;
        });

        const order = await ctx.db.mutation.createOrder({
          data: {
            tracking: 'MRS' + new Date().getTime(),
            total: amount.price,
            totalCost: amount.cost,
            items: { create: orderItems },
            user: { connect: { id: userId } },
            clientName,
            clientAccount,
          },
        });
        
        await transport.sendMail({
          from: 'enrique.acuna@gmail.com',
          to: user.email,
          subject: `Nuevo Pedido ${order.id}`,
          html: orderEmail(order, orderItems,user),
      });

        const cartItemIds = user.cart.map(cartItem => cartItem.id);
        await ctx.db.mutation.deleteManyCartItems({
          where: {
            id_in: cartItemIds,
          },
        });

        return order;
      },
};

module.exports = Mutations;

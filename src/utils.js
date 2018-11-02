function hasPermission(user, permissionsNeeded) {
  const matchedPermissions = user.permissions.filter(permissionTheyHave =>
    permissionsNeeded.includes(permissionTheyHave)
  );
  if (!matchedPermissions.length) {
    throw new Error(`You do not have sufficient permissions

      : ${permissionsNeeded}

      You Have:

      ${user.permissions}
      `);
  }
}

const checkPermissions = (userPermissions, permissions)=>{
  if(!permissions){
      return false;
  }
  return userPermissions.some(permission => permissions.includes(permission));
}

function formatMoney(amount) {
  const options = {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  };
  // if its a whole, dollar amount, leave off the .00
  if (amount % 100 === 0) options.minimumFractionDigits = 0;
  const formatter = new Intl.NumberFormat('en-US', options);
  return formatter.format(amount / 100);
}

const AppPermissions = {
  admin: 'ADMIN',
  user: 'USER',
  itemCreate:'ITEMCREATE',
  itemUpdate:'ITEMUPDATE',
  itemDelete:'ITEMDELETE',
  permissionUpdate:'PERMISSIONUPDATE',
  orderUpdate:'ORDERUPDATE',
}
Object.freeze(AppPermissions);

exports.hasPermission = hasPermission;
exports.checkPermissions = checkPermissions;
exports.AppPermissions = AppPermissions;
exports.formatMoney = formatMoney;

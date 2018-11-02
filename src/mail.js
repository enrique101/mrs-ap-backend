const nodemailer = require('nodemailer');
const { formatMoney } = require('./utils');
const moment = require('moment');

const transport = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: process.env.MAIL_PORT,
    auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
    },
});

const makeANiceEmail = (name,text) => `
  <div className="email" style="
    border: 1px solid black;
    padding: 20px;
    font-family: sans-serif;
    line-height: 2;
    font-size: 20px;
  ">
    <h2>Hola ${name}</h2>
    <p>${text}</p>
  </div>
`;

const orderEmail = ({ tracking, clientAccount, clientName, createdAt, totalCost }, orderItems, {name,email}) => {
  const localLocale = moment(createdAt);
  moment.locale('es');
  localLocale.locale(false);
  const itemList = orderItems.map(item => orderRow(item)).join('');
  return `
  <table width="90%" border="0" cellspacing="0" cellpadding="0" bgcolor="#ffffff" align="center">
    <tbody>
      <tr>
          <td>
              <table width="100%" border="0" align="center" cellpadding="0" cellspacing="0">
                  <tbody>
                      <tr>
                          <td valign="top" align="left">
                            <b>
                                  Fecha: 
                            </b>
                            ${localLocale.format('LL')}
                          </td>
                      </tr>
                      <tr><td valign="top" align="left">
                        <b>Numero de Tracking:</b>
                        ${tracking}
                      </td></tr>
                      <tr><td valign="top" align="left">
                        <b>Hecha por:</b> ${ name } - ${ email }
                      </td></tr>
                      <tr><td valign="top" align="left">
                        <b>Para el cliente:</b> ${ clientName } - ${ clientAccount }
                      </td></tr>
                      <tr><td valign="top" align="left">
                        <b>Total:</b> ${formatMoney(totalCost)}
                      </td></tr>
                  </tbody>
              </table>
              <br>
  <table width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="#000000" align="center">
    <tbody>
      <tr bgcolor="#000000">
      <td>
        <table width="100%" border="0" cellspacing="3" cellpadding="0" align="center" bgcolor="#000000">
          <tbody><tr bgcolor="#ffffff">
            <td valign="top" colspan="2">
              <table width="100%" border="0" cellspacing="0" cellpadding="5">
                <tbody><tr bgcolor="#ffffff">
                  <td>
                    <b class="sans"><center>
                      Detalle de la Orden
                    </center></b>
                  </td>
                </tr>
              </tbody></table>
            </td>
          </tr>
          <tr>
            <td bgcolor="#ffffff" valign="top" colspan="2">
              <table width="100%" border="0" cellspacing="0" cellpadding="2">
                <tbody><tr valign="top">
                  <td width="100%">
                    <table border="0" cellspacing="0" cellpadding="2" align="right">
                      <tbody><tr valign="top">
                        <td align="right">
                          &nbsp;
                        </td>
                      </tr>
                    </tbody></table>
                    <table border="0" cellspacing="2" cellpadding="0" width="100%">
                      <tbody><tr valign="top">
                        <td valign="top">
                          <b>Articulos Ordenados</b>
                        </td>
                        <td align="right" valign="top">
                          <b>Precio</b>
                        </td>
                      </tr>
                      ${itemList}
                    </tbody></table>
                    <br>
                  </td>
                </tr>
              </tbody></table>
            </td>
          </tr>
          
        </tbody></table>
      </td>
    </tr>
  </tbody></table>
      </td>
    </tr>
  </tbody>
  </table>
  `;
}

const orderRow = ({quantity,title,cost}) => {
  return `<tr>
            <td colspan="1" valign="top">
              ${quantity} X <i>${title}</i><br>
            </td>
            <td align="right" valign="top" colspan="2">
              ${formatMoney(cost)}<br>
            </td>
        </tr>`;
};

exports.transport = transport;
exports.makeANiceEmail = makeANiceEmail;
exports.orderEmail = orderEmail;
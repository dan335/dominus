// The soak test's mail server: takes every email the app sends and writes it
// to /out/mail/<n>.eml, so nothing is delivered. The bots read their
// verification links from there. A production build has no other way to send
// mail without MAIL_URL (Email.send throws), so the soak needs one.

const net = require('net');
const fs = require('fs');
const path = require('path');

const dir = path.join(process.env.SOAK_OUT || '/out', 'mail');
fs.mkdirSync(dir, {recursive: true});
let count = 0;

net.createServer((socket) => {
  let buffer = '';
  let data = null;
  const reply = (line) => socket.write(line + '\r\n');
  reply('220 soak-mail ESMTP');
  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    for (;;) {
      if (data !== null) {
        const end = buffer.indexOf('\r\n.\r\n');
        if (end < 0) return;
        data += buffer.slice(0, end);
        buffer = buffer.slice(end + 5);
        fs.writeFileSync(path.join(dir, String(++count).padStart(6, '0') + '.eml'), data.replace(/^\.\./gm, '.'));
        data = null;
        reply('250 OK');
        continue;
      }
      const newline = buffer.indexOf('\r\n');
      if (newline < 0) return;
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 2);
      const verb = line.slice(0, 4).toUpperCase();
      if (verb == 'EHLO' || verb == 'HELO') reply('250 soak-mail');
      else if (verb == 'DATA') {
        data = '';
        reply('354 go ahead');
      } else if (verb == 'QUIT') {
        reply('221 bye');
        socket.end();
      } else reply('250 OK');
    }
  });
  socket.on('error', () => {});
}).listen(25, () => console.log('soak mail server listening on 25, writing to ' + dir));

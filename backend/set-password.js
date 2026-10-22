const sql = require('mssql/msnodesqlv8');
const crypto = require('crypto');
const readline = require('readline');

const config = {
  connectionString: 'Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=dbDrawingManagment;Trusted_Connection=Yes;TrustServerCertificate=Yes;',
  connectionTimeout: 15000,
  requestTimeout: 30000,
};

function askHidden(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const stdin = process.stdin;
    const stdout = process.stdout;
    process.stdout.write(question);
    stdin.setRawMode?.(true);
    let value = '';
    const onData = ch => {
      ch = ch.toString();
      if (ch === '\n' || ch === '\r') {
        stdin.setRawMode?.(false);
        stdin.off('data', onData);
        rl.close();
        stdout.write('\n');
        resolve(value);
      } else if (ch === '\u0003') {
        process.exit(130);
      } else if (ch === '\u007f' || ch === '\b') {
        if (value.length) value = value.slice(0, -1);
      } else if (ch >= ' ') {
        value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const N = 16384, r = 8, p = 1, keyLength = 64;
    const salt = crypto.randomBytes(16);
    crypto.scrypt(password, salt, keyLength, { N, r, p }, (err, derived) => {
      if (err) reject(err);
      else resolve(['scrypt', N, r, p, salt.toString('base64'), derived.toString('base64')].join('$'));
    });
  });
}

(async () => {
  const username = process.argv[2]?.trim();
  if (!username) {
    console.error('Usage: node set-password.js <username>');
    process.exit(1);
  }
  const password = await askHidden('New password: ');
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }
  const confirm = await askHidden('Confirm password: ');
  if (password !== confirm) {
    console.error('Passwords do not match.');
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const pool = await sql.connect(config);
  const request = pool.request();
  request.input('username', sql.NVarChar(100), username);
  request.input('passwordHash', sql.NVarChar(255), passwordHash);
  const result = await request.query(
    'UPDATE dbo.Users SET PasswordHash=@passwordHash, UpdatedAt=SYSUTCDATETIME() WHERE Username=@username; SELECT @@ROWCOUNT AS Affected;'
  );
  const affected = Number(result.recordset?.[0]?.Affected || 0);
  await pool.close();
  if (affected !== 1) {
    console.error('User not found or update failed.');
    process.exit(1);
  }
  console.log('Password updated successfully.');
})().catch(err => {
  console.error('Password update failed:', err.message);
  process.exit(1);
});

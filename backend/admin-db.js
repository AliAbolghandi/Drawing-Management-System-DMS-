const express = require('express');

function registerAdminDatabaseRoutes(app, deps) {
  const { sql, auth, crypto, sendServerError } = deps;

  function qi(name) {
    return '[' + String(name).replace(/]/g, ']]') + ']';
  }

  function sqlType(c) {
    const t = String(c.DataType).toLowerCase();
    if (['nvarchar','nchar','ntext'].includes(t)) return sql.NVarChar(sql.MAX);
    if (['varchar','char','text'].includes(t)) return sql.VarChar(sql.MAX);
    if (t === 'uniqueidentifier') return sql.UniqueIdentifier;
    if (t === 'int') return sql.Int;
    if (t === 'bigint') return sql.BigInt;
    if (t === 'smallint') return sql.SmallInt;
    if (t === 'tinyint') return sql.TinyInt;
    if (t === 'bit') return sql.Bit;
    if (['decimal','numeric'].includes(t)) return sql.Decimal(Math.max(1, c.PrecisionValue || 18), Math.max(0, c.ScaleValue || 0));
    if (t === 'float') return sql.Float;
    if (t === 'real') return sql.Real;
    if (t === 'date') return sql.Date;
    if (t === 'datetime') return sql.DateTime;
    if (t === 'datetime2') return sql.DateTime2;
    if (t === 'smalldatetime') return sql.SmallDateTime;
    if (t === 'time') return sql.Time;
    if (t === 'money') return sql.Money;
    if (t === 'smallmoney') return sql.SmallMoney;
    if (['binary','varbinary','image'].includes(t)) return sql.VarBinary(sql.MAX);
    return sql.NVarChar(sql.MAX);
  }

  function value(c, v) {
    if (v === undefined) return undefined;
    if (v === null || v === '') return c.IsNullable ? null : v;
    const t = String(c.DataType).toLowerCase();
    if (t === 'bit') {
      if (typeof v === 'boolean') return v;
      if (v === 1 || v === '1' || String(v).toLowerCase() === 'true') return true;
      if (v === 0 || v === '0' || String(v).toLowerCase() === 'false') return false;
      throw Object.assign(new Error('Invalid bit value for ' + c.ColumnName + '.'), { statusCode: 400 });
    }
    if (['int','bigint','smallint','tinyint'].includes(t)) {
      const n = Number(v);
      if (!Number.isInteger(n)) throw Object.assign(new Error('Invalid integer value for ' + c.ColumnName + '.'), { statusCode: 400 });
      return n;
    }
    if (['decimal','numeric','float','real','money','smallmoney'].includes(t)) {
      const n = Number(v);
      if (!Number.isFinite(n)) throw Object.assign(new Error('Invalid numeric value for ' + c.ColumnName + '.'), { statusCode: 400 });
      return n;
    }
    return v;
  }

  async function metadata(tableName) {
    if (tableName === 'sysdiagrams') return null;
    const r = new sql.Request();
    r.input('tableName', sql.NVarChar(128), tableName);
    const q = await r.query(
      "SELECT c.column_id AS ColumnID,c.name AS ColumnName,ty.name AS DataType,c.max_length AS MaxLength," +
      "c.precision AS PrecisionValue,c.scale AS ScaleValue,c.is_nullable AS IsNullable,c.is_identity AS IsIdentity," +
      "c.is_computed AS IsComputed,dc.definition AS DefaultDefinition," +
      "CAST(CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END AS bit) AS IsPrimaryKey " +
      "FROM sys.tables t INNER JOIN sys.schemas s ON s.schema_id=t.schema_id " +
      "INNER JOIN sys.columns c ON c.object_id=t.object_id INNER JOIN sys.types ty ON ty.user_type_id=c.user_type_id " +
      "LEFT JOIN sys.default_constraints dc ON dc.parent_object_id=c.object_id AND dc.parent_column_id=c.column_id " +
      "LEFT JOIN (SELECT ic.object_id,ic.column_id FROM sys.index_columns ic INNER JOIN sys.indexes i " +
      "ON i.object_id=ic.object_id AND i.index_id=ic.index_id WHERE i.is_primary_key=1) pk " +
      "ON pk.object_id=c.object_id AND pk.column_id=c.column_id " +
      "WHERE s.name=N'dbo' AND t.name=@tableName ORDER BY c.column_id;"
    );
    if (!q.recordset.length) return null;
    const f = await r.query(
      "SELECT pc.name AS ColumnName,OBJECT_SCHEMA_NAME(fkc.referenced_object_id)+N'.'+OBJECT_NAME(fkc.referenced_object_id) AS ReferencedTable,rc.name AS ReferencedColumn " +
      "FROM sys.foreign_key_columns fkc INNER JOIN sys.columns pc ON pc.object_id=fkc.parent_object_id AND pc.column_id=fkc.parent_column_id " +
      "INNER JOIN sys.columns rc ON rc.object_id=fkc.referenced_object_id AND rc.column_id=fkc.referenced_column_id " +
      "WHERE fkc.parent_object_id=OBJECT_ID(N'dbo.' + @tableName);"
    );
    const columns = q.recordset.map(c => ({
      ...c,
      ColumnID: Number(c.ColumnID),
      MaxLength: Number(c.MaxLength),
      PrecisionValue: Number(c.PrecisionValue),
      ScaleValue: Number(c.ScaleValue),
      IsNullable: Boolean(c.IsNullable),
      IsIdentity: Boolean(c.IsIdentity),
      IsComputed: Boolean(c.IsComputed),
      IsPrimaryKey: Boolean(c.IsPrimaryKey),
      ReadOnly: Boolean(c.IsIdentity || c.IsComputed || ['CreatedAt','UpdatedAt','LastLoginAt'].includes(c.ColumnName))
    }));
    return {
      tableName,
      readOnly: tableName === 'Logs',
      columns,
      foreignKeys: f.recordset
    };
  }

  async function tables() {
    const q = await new sql.Request().query(
      "SELECT t.name AS TableName,SUM(p.rows) AS ApproxRows " +
      "FROM sys.tables t INNER JOIN sys.schemas s ON s.schema_id=t.schema_id " +
      "LEFT JOIN sys.partitions p ON p.object_id=t.object_id AND p.index_id IN (0,1) " +
      "WHERE s.name=N'dbo' AND t.name<>N'sysdiagrams' " +
      "GROUP BY t.name ORDER BY t.name;"
    );
    return q.recordset.map(x => ({ tableName: x.TableName, approxRows: Number(x.ApproxRows || 0) }));
  }

  function keys(meta, data, r) {
    const pk = meta.columns.filter(c => c.IsPrimaryKey);
    if (!pk.length) throw Object.assign(new Error('This table has no primary key and cannot be edited or deleted safely.'), { statusCode: 400 });
    if (!data || typeof data !== 'object') throw Object.assign(new Error('Primary key values are required.'), { statusCode: 400 });
    return pk.map(c => {
      if (!(c.ColumnName in data)) throw Object.assign(new Error('Missing primary key: ' + c.ColumnName + '.'), { statusCode: 400 });
      const p = 'key_' + c.ColumnName.replace(/[^A-Za-z0-9_]/g, '_');
      r.input(p, sqlType(c), value(c, data[c.ColumnName]));
      return qi(c.ColumnName) + '=@' + p;
    }).join(' AND ');
  }

  async function hashPassword(password) {
    if (typeof password !== 'string' || password.length < 8) {
      throw Object.assign(new Error('Password must be at least 8 characters.'), { statusCode: 400 });
    }
    return new Promise((resolve, reject) => {
      const N = 16384, r = 8, p = 1, keyLength = 64, salt = crypto.randomBytes(16);
      crypto.scrypt(password, salt, keyLength, { N, r, p }, (err, derived) => {
        if (err) reject(err);
        else resolve(['scrypt', N, r, p, salt.toString('base64'), derived.toString('base64')].join('$'));
      });
    });
  }

  app.get('/api/admin/tables', auth.requireAdmin(), async (req, res) => {
    try {
      const list = await tables();
      const result = [];
      for (const t of list) result.push({ ...(await metadata(t.tableName)), approxRows: t.approxRows });
      res.json({ tables: result });
    } catch (e) {
      sendServerError(res, 'Admin table metadata failed', e);
    }
  });

  app.get('/api/admin/tables/:tableName/rows', auth.requireAdmin(), async (req, res) => {
    try {
      const meta = await metadata(String(req.params.tableName || ''));
      if (!meta) return res.status(404).json({ error: 'Table not found.' });
      const page = Math.min(10000, Math.max(1, Number(req.query.page) || 1));
      const pageSize = Math.min(200, Math.max(10, Number(req.query.pageSize) || 50));
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
      const order = meta.columns.find(c => c.IsPrimaryKey)?.ColumnName || meta.columns[0].ColumnName;
      const r = new sql.Request();
      r.input('offset', sql.Int, (page - 1) * pageSize);
      r.input('fetch', sql.Int, pageSize);
      const searchable = meta.columns.filter(c =>
        ['nvarchar','varchar','nchar','char','text','ntext'].includes(String(c.DataType).toLowerCase())
      ).slice(0, 10);
      let where = '';
      if (search && searchable.length) {
        r.input('search', sql.NVarChar(4000), '%' + search + '%');
        where = 'WHERE ' + searchable.map(c =>
          'TRY_CONVERT(nvarchar(max),' + qi(c.ColumnName) + ') LIKE @search'
        ).join(' OR ');
      }
      const tableSql = 'dbo.' + qi(meta.tableName);
      const count = await r.query('SELECT COUNT_BIG(*) AS Total FROM ' + tableSql + ' ' + where + ';');
      const selectColumns = meta.columns.map(c => c.ColumnName === 'PasswordHash' ? 'CAST(NULL AS nvarchar(500)) AS [PasswordHash]' : qi(c.ColumnName)).join(',');
      const rows = await r.query(
        'SELECT ' + selectColumns +
        ' FROM ' + tableSql + ' ' + where +
        ' ORDER BY ' + qi(order) +
        ' OFFSET @offset ROWS FETCH NEXT @fetch ROWS ONLY;'
      );
      res.json({ table: meta, rows: rows.recordset, total: Number(count.recordset[0].Total), page, pageSize });
    } catch (e) {
      sendServerError(res, 'Admin table rows failed', e);
    }
  });

  app.post('/api/admin/tables/:tableName/rows', auth.requireAdmin(), async (req, res) => {
    try {
      const tableName = String(req.params.tableName || '');
      const meta = await metadata(tableName);
      if (!meta) return res.status(404).json({ error: 'Table not found.' });
      if (meta.readOnly) return res.status(403).json({ error: 'This table is read-only.' });
      const data = req.body?.data && typeof req.body.data === 'object' ? req.body.data : {};
      const r = new sql.Request(), fields = [], params = [];
      for (const c of meta.columns) {
        if (c.IsIdentity || c.IsComputed || c.ReadOnly || c.ColumnName === 'PasswordHash' || !(c.ColumnName in data)) continue;
        const p = 'v_' + c.ColumnName.replace(/[^A-Za-z0-9_]/g, '_');
        r.input(p, sqlType(c), value(c, data[c.ColumnName]));
        fields.push(qi(c.ColumnName));
        params.push('@' + p);
      }
      if (tableName === 'Users' && typeof req.body?.password === 'string' && req.body.password.length) {
        r.input('passwordHash', sql.NVarChar(500), await hashPassword(req.body.password));
        fields.push('[PasswordHash]');
        params.push('@passwordHash');
      }
      if (!fields.length) return res.status(400).json({ error: 'No writable values were supplied.' });
      const q = await r.query(
        'INSERT INTO dbo.' + qi(tableName) + ' (' + fields.join(',') + ') OUTPUT INSERTED.* VALUES (' + params.join(',') + ');'
      );
      await auth.writeAudit(req.user.userId, req.user.username, 'ADMIN_INSERT_' + tableName, req.ip);
      res.status(201).json({ success: true, row: q.recordset[0] });
    } catch (e) {
      if (e.number === 2627 || e.number === 2601) return res.status(409).json({ error: 'Duplicate value violates a unique constraint.' });
      if (e.number === 547) return res.status(409).json({ error: 'Foreign key constraint prevents this operation.' });
      res.status(e.statusCode || 500).json({ error: e.message || 'Insert failed.' });
    }
  });

  app.patch('/api/admin/tables/:tableName/rows', auth.requireAdmin(), async (req, res) => {
    try {
      const tableName = String(req.params.tableName || '');
      const meta = await metadata(tableName);
      if (!meta) return res.status(404).json({ error: 'Table not found.' });
      if (meta.readOnly) return res.status(403).json({ error: 'This table is read-only.' });
      const data = req.body?.data && typeof req.body.data === 'object' ? req.body.data : {};
      const r = new sql.Request(), set = [];
      for (const c of meta.columns) {
        if (c.IsIdentity || c.IsComputed || c.ReadOnly || c.IsPrimaryKey || c.ColumnName === 'PasswordHash' || !(c.ColumnName in data)) continue;
        const p = 'v_' + c.ColumnName.replace(/[^A-Za-z0-9_]/g, '_');
        r.input(p, sqlType(c), value(c, data[c.ColumnName]));
        set.push(qi(c.ColumnName) + '=@' + p);
      }
      if (tableName === 'Users' && typeof req.body?.password === 'string' && req.body.password.length) {
        r.input('passwordHash', sql.NVarChar(500), await hashPassword(req.body.password));
        set.push('[PasswordHash]=@passwordHash');
      }
      if (tableName === 'Users' && set.length && !set.some(x => x.includes('[UpdatedAt]'))) {
        set.push('[UpdatedAt]=SYSUTCDATETIME()');
      }
      if (!set.length) return res.status(400).json({ error: 'No editable values were supplied.' });
      const where = keys(meta, req.body?.keys, r);
      const q = await r.query(
        'UPDATE dbo.' + qi(tableName) + ' SET ' + set.join(',') + ' WHERE ' + where + '; SELECT @@ROWCOUNT AS Affected;'
      );
      if (Number(q.recordset[0]?.Affected || 0) !== 1) return res.status(404).json({ error: 'Record not found.' });
      await auth.writeAudit(req.user.userId, req.user.username, 'ADMIN_UPDATE_' + tableName, req.ip);
      res.json({ success: true });
    } catch (e) {
      if (e.number === 2627 || e.number === 2601) return res.status(409).json({ error: 'Duplicate value violates a unique constraint.' });
      if (e.number === 547) return res.status(409).json({ error: 'Foreign key constraint prevents this operation.' });
      res.status(e.statusCode || 500).json({ error: e.message || 'Update failed.' });
    }
  });

  app.delete('/api/admin/tables/:tableName/rows', auth.requireAdmin(), async (req, res) => {
    try {
      const tableName = String(req.params.tableName || '');
      const meta = await metadata(tableName);
      if (!meta) return res.status(404).json({ error: 'Table not found.' });
      if (meta.readOnly) return res.status(403).json({ error: 'This table is read-only.' });
      const r = new sql.Request();
      const where = keys(meta, req.body?.keys, r);
      const q = await r.query(
        'DELETE FROM dbo.' + qi(tableName) + ' WHERE ' + where + '; SELECT @@ROWCOUNT AS Affected;'
      );
      if (Number(q.recordset[0]?.Affected || 0) !== 1) return res.status(404).json({ error: 'Record not found.' });
      await auth.writeAudit(req.user.userId, req.user.username, 'ADMIN_DELETE_' + tableName, req.ip);
      res.json({ success: true });
    } catch (e) {
      if (e.number === 547) return res.status(409).json({ error: 'Foreign key constraint prevents deletion. Remove dependent records first.' });
      res.status(e.statusCode || 500).json({ error: e.message || 'Delete failed.' });
    }
  });
}

module.exports = { registerAdminDatabaseRoutes };

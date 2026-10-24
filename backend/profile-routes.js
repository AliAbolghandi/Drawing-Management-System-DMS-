const multer = require('multer');

function registerProfileRoutes(router, { sql, authenticate, rateLimit, csrf, verifyPassword, hashPassword, writeAudit, clientIp }) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 750 * 1024, files: 1 },
    fileFilter: (req, file, cb) => cb(null, new Set(['image/jpeg', 'image/png', 'image/webp']).has(String(file.mimetype || '').toLowerCase())),
  });

  const cleanText = (value, label) => {
    if (typeof value !== 'string') throw Object.assign(new Error(`${label} is required.`), { statusCode: 400 });
    const text = value.trim();
    if (text.length > 100) throw Object.assign(new Error(`${label} must be 100 characters or fewer.`), { statusCode: 400 });
    return text;
  };

  const validateProfileImage = file => {
    if (!file || !Buffer.isBuffer(file.buffer)) throw Object.assign(new Error('Profile image is required.'), { statusCode: 400 });
    const b = file.buffer, type = String(file.mimetype || '').toLowerCase();
    const validSignature = (type === 'image/jpeg' && b.length >= 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF)
      || (type === 'image/png' && b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A])))
      || (type === 'image/webp' && b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP');
    if (!validSignature) throw Object.assign(new Error('Invalid profile image content.'), { statusCode: 400 });
    return type;
  };

  router.get('/me/profile', rateLimit, authenticate, async (req, res) => {
    try {
      const r = new sql.Request(); r.input('userId', sql.Int, req.user.userId);
      const q = await r.query(`SELECT u.UserID,u.Username,u.Name,u.Family,u.LastLoginAt,CASE WHEN u.ProfileImage IS NULL THEN CAST(0 AS bit) ELSE CAST(1 AS bit) END AS HasProfileImage,
        STUFF((SELECT N', ' + r2.RoleName FROM dbo.UserRoles ur2 INNER JOIN dbo.Roles r2 ON r2.RoleID=ur2.RoleID WHERE ur2.UserID=u.UserID AND r2.IsActive=1 FOR XML PATH(''),TYPE).value('.','nvarchar(max)'),1,2,N'') AS RoleName
        FROM dbo.Users u WHERE u.UserID=@userId AND u.IsActive=1;`);
      const row = q.recordset[0];
      if (!row) return res.status(401).json({ error: 'Authentication required.' });
      res.json({ user: { userId:Number(row.UserID), username:String(row.Username||''), name:row.Name||'', family:row.Family||'', role:row.RoleName||'Signed in', lastLoginAt:row.LastLoginAt||null, hasProfileImage:Boolean(row.HasProfileImage) } });
    } catch (e) { console.error('Profile load failed:', e.message); res.status(500).json({ error: 'Could not load profile.' }); }
  });

  router.put('/me/profile', rateLimit, csrf, authenticate, async (req, res) => {
    try {
      const name = cleanText(req.body?.name, 'Name'), family = cleanText(req.body?.family, 'Family');
      const r = new sql.Request(); r.input('userId', sql.Int, req.user.userId); r.input('name', sql.NVarChar(100), name); r.input('family', sql.NVarChar(100), family);
      await r.query('UPDATE dbo.Users SET Name=@name,Family=@family,UpdatedAt=SYSUTCDATETIME() WHERE UserID=@userId AND IsActive=1;');
      await writeAudit(req.user.userId, req.user.username, 'PROFILE_UPDATED_SELF', clientIp(req)); res.json({ success:true });
    } catch (e) { console.error('Profile update failed:', e.message); res.status(e.statusCode||500).json({ error:e.message||'Could not update profile.' }); }
  });

  router.put('/me/profile-password', rateLimit, csrf, authenticate, async (req, res) => {
    const currentPassword=req.body?.currentPassword, newPassword=req.body?.newPassword;
    if (typeof currentPassword!=='string'||!currentPassword) return res.status(400).json({error:'Current password is required.'});
    if (typeof newPassword!=='string'||newPassword.length<8) return res.status(400).json({error:'New password must be at least 8 characters.'});
    if (newPassword.length>256) return res.status(400).json({error:'New password is too long.'});
    if (newPassword===currentPassword) return res.status(400).json({error:'New password must differ from the current password.'});
    try {
      const r=new sql.Request(); r.input('userId',sql.Int,req.user.userId); const q=await r.query('SELECT PasswordHash FROM dbo.Users WHERE UserID=@userId AND IsActive=1;'); const stored=q.recordset?.[0]?.PasswordHash;
      if(!stored||!(await verifyPassword(currentPassword,stored))){await writeAudit(req.user.userId,req.user.username,'PROFILE_PASSWORD_CHANGE_FAILED',clientIp(req));return res.status(400).json({error:'Current password is incorrect.'});}
      const u=new sql.Request(); u.input('userId',sql.Int,req.user.userId); u.input('passwordHash',sql.NVarChar(500),await hashPassword(newPassword)); await u.query('UPDATE dbo.Users SET PasswordHash=@passwordHash,UpdatedAt=SYSUTCDATETIME() WHERE UserID=@userId AND IsActive=1;');
      await writeAudit(req.user.userId,req.user.username,'PROFILE_PASSWORD_CHANGED',clientIp(req)); res.json({success:true});
    } catch(e){console.error('Profile password change failed:',e.message);res.status(500).json({error:'Could not change password.'});}
  });

  router.get('/me/profile-image', rateLimit, authenticate, async (req,res)=>{
    try{const r=new sql.Request();r.input('userId',sql.Int,req.user.userId);const q=await r.query('SELECT ProfileImage,ProfileImageContentType FROM dbo.Users WHERE UserID=@userId AND IsActive=1;');const row=q.recordset[0];if(!row?.ProfileImage)return res.status(404).send('Profile image not found.');res.setHeader('Content-Type',row.ProfileImageContentType||'application/octet-stream');res.setHeader('Cache-Control','private, no-store');res.send(row.ProfileImage);}catch(e){console.error('Profile image load failed:',e.message);res.status(500).json({error:'Could not load profile image.'});}
  });

  router.put('/me/profile-image', rateLimit, csrf, authenticate, (req,res)=>{
    upload.single('photo')(req,res,async error=>{
      if(error||!req.file)return res.status(400).json({error:'Invalid profile image. Use JPG, PNG, or WebP up to 750 KB.'});
      try{const contentType=validateProfileImage(req.file);const r=new sql.Request();r.input('userId',sql.Int,req.user.userId);r.input('image',sql.VarBinary(sql.MAX),req.file.buffer);r.input('contentType',sql.NVarChar(50),contentType);await r.query('UPDATE dbo.Users SET ProfileImage=@image,ProfileImageContentType=@contentType,UpdatedAt=SYSUTCDATETIME() WHERE UserID=@userId AND IsActive=1;');await writeAudit(req.user.userId,req.user.username,'PROFILE_IMAGE_UPDATED',clientIp(req));res.json({success:true});}catch(e){console.error('Profile image update failed:',e.message);res.status(e.statusCode||500).json({error:e.message||'Could not update profile image.'});}
    });
  });

  router.delete('/me/profile-image', rateLimit, csrf, authenticate, async (req,res)=>{
    try{const r=new sql.Request();r.input('userId',sql.Int,req.user.userId);await r.query('UPDATE dbo.Users SET ProfileImage=NULL,ProfileImageContentType=NULL,UpdatedAt=SYSUTCDATETIME() WHERE UserID=@userId AND IsActive=1;');await writeAudit(req.user.userId,req.user.username,'PROFILE_IMAGE_REMOVED',clientIp(req));res.json({success:true});}catch(e){console.error('Profile image removal failed:',e.message);res.status(500).json({error:'Could not remove profile image.'});}
  });
}

module.exports={registerProfileRoutes};

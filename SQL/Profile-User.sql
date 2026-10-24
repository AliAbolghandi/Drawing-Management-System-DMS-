/* DMS User Profile storage migration
   Adds only profile-photo storage metadata to dbo.Users.
   Passwords remain in PasswordHash and are never stored in plaintext.
*/

IF COL_LENGTH('dbo.Users', 'ProfileImage') IS NULL
BEGIN
    ALTER TABLE dbo.Users ADD ProfileImage VARBINARY(MAX) NULL;
END;

IF COL_LENGTH('dbo.Users', 'ProfileImageContentType') IS NULL
BEGIN
    ALTER TABLE dbo.Users ADD ProfileImageContentType NVARCHAR(50) NULL;
END;
GO

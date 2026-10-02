-- Run after a verified backup. Existing inconsistent data aborts this transaction;
-- no duplicate or historical record is automatically deleted.
IF COL_LENGTH('dbo.Yoneticiler','Token_Version') IS NULL
    ALTER TABLE dbo.Yoneticiler ADD Token_Version int NOT NULL CONSTRAINT DF_Yoneticiler_TokenVersion DEFAULT 0;
UPDATE dbo.Users SET Sistem_ID=CONVERT(nvarchar(50),CONVERT(bigint,90000000000)+ID) WHERE Sistem_ID IS NULL OR Sistem_ID='';
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name='UX_Users_TC') CREATE UNIQUE INDEX UX_Users_TC ON dbo.Users(TC_Kimlik) WHERE TC_Kimlik IS NOT NULL AND TC_Kimlik<>N'';
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name='UX_Users_Sicil') CREATE UNIQUE INDEX UX_Users_Sicil ON dbo.Users(Sicil_No) WHERE Sicil_No IS NOT NULL AND Sicil_No<>N'';
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name='UX_Users_Sistem') CREATE UNIQUE INDEX UX_Users_Sistem ON dbo.Users(Sistem_ID) WHERE Sistem_ID IS NOT NULL AND Sistem_ID<>N'';
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name='UX_Permissions_UserDoor') CREATE UNIQUE INDEX UX_Permissions_UserDoor ON dbo.Permissions(User_ID,Door_ID);
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name='UX_Personel_Vardiya_Open') CREATE UNIQUE INDEX UX_Personel_Vardiya_Open ON dbo.Personel_Vardiya(User_ID) WHERE Bitis_Tarihi IS NULL;
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name='IX_Logs_CardTime') CREATE INDEX IX_Logs_CardTime ON dbo.Logs(RFID_Kart_No,Zaman) INCLUDE (Door_ID,Basarili_Mi);
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name='IX_Logs_Time') CREATE INDEX IX_Logs_Time ON dbo.Logs(Zaman) INCLUDE(RFID_Kart_No,Door_ID,Basarili_Mi);
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name='IX_Personel_Vardiya_History') CREATE INDEX IX_Personel_Vardiya_History ON dbo.Personel_Vardiya(User_ID,Baslangic_Tarihi DESC,ID DESC) INCLUDE(Vardiya_ID,Bitis_Tarihi);
IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE name='FK_PV_User') ALTER TABLE dbo.Personel_Vardiya WITH CHECK ADD CONSTRAINT FK_PV_User FOREIGN KEY(User_ID) REFERENCES dbo.Users(ID);
IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE name='FK_PV_Shift') ALTER TABLE dbo.Personel_Vardiya WITH CHECK ADD CONSTRAINT FK_PV_Shift FOREIGN KEY(Vardiya_ID) REFERENCES dbo.Vardiyalar(ID);
IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE name='FK_Overtime_User') ALTER TABLE dbo.Mesai_Onaylari WITH CHECK ADD CONSTRAINT FK_Overtime_User FOREIGN KEY(User_ID) REFERENCES dbo.Users(ID);
IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE name='CK_Leave_Dates') ALTER TABLE dbo.Izinler WITH CHECK ADD CONSTRAINT CK_Leave_Dates CHECK(Bitis_Tarihi>=Baslangic_Tarihi);
IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE name='CK_Shift_Dates') ALTER TABLE dbo.Personel_Vardiya WITH CHECK ADD CONSTRAINT CK_Shift_Dates CHECK(Bitis_Tarihi IS NULL OR Bitis_Tarihi>=Baslangic_Tarihi);
IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE name='CK_Overtime_Minutes') ALTER TABLE dbo.Mesai_Onaylari WITH CHECK ADD CONSTRAINT CK_Overtime_Minutes CHECK(Hesaplanan_Dk>=0 AND (Onaylanan_Dk IS NULL OR Onaylanan_Dk>=0));

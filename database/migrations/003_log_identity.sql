-- Freeze the owner at capture time. Legacy rows can only be matched against
-- the current card owner; earlier card transfers cannot be reconstructed.
ALTER TABLE dbo.Logs ADD User_ID int NULL;
EXEC(N'UPDATE L SET User_ID=U.ID FROM dbo.Logs L JOIN dbo.Users U ON U.RFID_Kart_No=L.RFID_Kart_No');
ALTER TABLE dbo.Logs WITH CHECK ADD CONSTRAINT FK_Logs_User FOREIGN KEY(User_ID) REFERENCES dbo.Users(ID);
CREATE INDEX IX_Logs_UserTime ON dbo.Logs(User_ID,Zaman) INCLUDE(Door_ID,Basarili_Mi,RFID_Kart_No);
-- Resolve all inserted rows, including multi-row inserts. Unmatched cards stay
-- unassigned permanently; later card registration must not claim old events.
EXEC(N'CREATE TRIGGER dbo.TR_Logs_CaptureOwner ON dbo.Logs AFTER INSERT AS
BEGIN
    SET NOCOUNT ON;
    UPDATE L SET User_ID=U.ID
    FROM dbo.Logs L JOIN inserted I ON I.ID=L.ID
    LEFT JOIN dbo.Users U ON U.RFID_Kart_No=I.RFID_Kart_No;
END');

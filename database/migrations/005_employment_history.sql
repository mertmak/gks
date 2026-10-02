-- Closed periods are archived when a person starts a new employment period.
-- Users retains the current/latest period for existing management screens.
CREATE TABLE dbo.Personel_Calisma_Gecmisi (
    ID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_PersonelCalismaGecmisi PRIMARY KEY,
    User_ID int NOT NULL,
    Baslangic_Tarihi date NULL,
    Bitis_Tarihi date NOT NULL,
    Cikis_Nedeni nvarchar(255) NULL,
    CONSTRAINT FK_CalismaGecmisi_User FOREIGN KEY(User_ID) REFERENCES dbo.Users(ID),
    CONSTRAINT CK_CalismaGecmisi_Dates CHECK(Baslangic_Tarihi IS NULL OR Bitis_Tarihi>=Baslangic_Tarihi)
);
CREATE INDEX IX_CalismaGecmisi_UserDates ON dbo.Personel_Calisma_Gecmisi(User_ID,Baslangic_Tarihi,Bitis_Tarihi);

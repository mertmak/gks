-- Existing GksDB schema, captured 2026-09-07. Contains no personnel or credentials.

IF OBJECT_ID(N'dbo.DoorLogs', N'U') IS NULL
BEGIN
CREATE TABLE [dbo].[DoorLogs] (
  [ID] [int] IDENTITY(1,1) NOT NULL,
  [Islem_Tipi] [nvarchar](50) NOT NULL,
  [Kapi_Adi] [nvarchar](100) NOT NULL,
  [Detay] [nvarchar](max) NULL,
  [Tarih] [datetime] NULL CONSTRAINT [DF_DoorLogs_Tarih] DEFAULT (getdate()),
  [Islemi_Yapan] [nvarchar](100) NULL CONSTRAINT [DF_DoorLogs_Islemi_Yapan] DEFAULT ('Sistem'),
  CONSTRAINT [PK_DoorLogs] PRIMARY KEY ([ID])
);
END;

IF OBJECT_ID(N'dbo.Doors', N'U') IS NULL
BEGIN
CREATE TABLE [dbo].[Doors] (
  [ID] [int] IDENTITY(1,1) NOT NULL,
  [Kapi_Adi] [nvarchar](100) NOT NULL,
  [Departman] [nvarchar](255) NULL,
  [Konum] [nvarchar](255) NULL,
  [Durum] [bit] NULL CONSTRAINT [DF_Doors_Durum] DEFAULT ((1)),
  [Kapi_Turu] [nvarchar](50) NULL CONSTRAINT [DF_Doors_Kapi_Turu] DEFAULT (N'İç Geçiş'),
  CONSTRAINT [PK_Doors] PRIMARY KEY ([ID])
);
END;

IF OBJECT_ID(N'dbo.Izinler', N'U') IS NULL
BEGIN
CREATE TABLE [dbo].[Izinler] (
  [ID] [int] IDENTITY(1,1) NOT NULL,
  [User_ID] [int] NOT NULL,
  [Izin_Turu] [nvarchar](50) NOT NULL,
  [Baslangic_Tarihi] [date] NOT NULL,
  [Bitis_Tarihi] [date] NOT NULL,
  [Aciklama] [nvarchar](255) NULL,
  [Durum] [nvarchar](20) NULL CONSTRAINT [DF_Izinler_Durum] DEFAULT (N'Onaylandı'),
  [Olusturulma_Tarihi] [datetime] NULL CONSTRAINT [DF_Izinler_Olusturulma_Tarihi] DEFAULT (getdate()),
  CONSTRAINT [PK_Izinler] PRIMARY KEY ([ID])
);
END;

IF OBJECT_ID(N'dbo.Logs', N'U') IS NULL
BEGIN
CREATE TABLE [dbo].[Logs] (
  [ID] [int] IDENTITY(1,1) NOT NULL,
  [RFID_Kart_No] [nvarchar](50) NOT NULL,
  [Door_ID] [int] NOT NULL,
  [Zaman] [datetime] NULL CONSTRAINT [DF_Logs_Zaman] DEFAULT (getdate()),
  [Basarili_Mi] [bit] NOT NULL,
  CONSTRAINT [PK_Logs] PRIMARY KEY ([ID])
);
END;

IF OBJECT_ID(N'dbo.Mesai_Onaylari', N'U') IS NULL
BEGIN
CREATE TABLE [dbo].[Mesai_Onaylari] (
  [ID] [int] IDENTITY(1,1) NOT NULL,
  [User_ID] [int] NOT NULL,
  [Tarih] [date] NOT NULL,
  [Hesaplanan_Dk] [int] NOT NULL,
  [Onaylanan_Dk] [int] NULL,
  [Durum] [nvarchar](50) NULL CONSTRAINT [DF_Mesai_Onaylari_Durum] DEFAULT ('Bekliyor'),
  [Aciklama] [nvarchar](255) NULL,
  [Islemi_Yapan] [nvarchar](100) NULL,
  [Islem_Zamani] [datetime] NULL CONSTRAINT [DF_Mesai_Onaylari_Islem_Zamani] DEFAULT (getdate()),
  CONSTRAINT [PK_Mesai_Onaylari] PRIMARY KEY ([ID])
);
END;

IF OBJECT_ID(N'dbo.Permissions', N'U') IS NULL
BEGIN
CREATE TABLE [dbo].[Permissions] (
  [ID] [int] IDENTITY(1,1) NOT NULL,
  [User_ID] [int] NOT NULL,
  [Door_ID] [int] NOT NULL,
  CONSTRAINT [PK_Permissions] PRIMARY KEY ([ID])
);
END;

IF OBJECT_ID(N'dbo.Personel_Vardiya', N'U') IS NULL
BEGIN
CREATE TABLE [dbo].[Personel_Vardiya] (
  [ID] [int] IDENTITY(1,1) NOT NULL,
  [User_ID] [int] NOT NULL,
  [Vardiya_ID] [int] NOT NULL,
  [Baslangic_Tarihi] [date] NULL CONSTRAINT [DF_Personel_Vardiya_Baslangic_Tarihi] DEFAULT (getdate()),
  [Bitis_Tarihi] [date] NULL,
  CONSTRAINT [PK_Personel_Vardiya] PRIMARY KEY ([ID])
);
END;

IF OBJECT_ID(N'dbo.SystemLogs', N'U') IS NULL
BEGIN
CREATE TABLE [dbo].[SystemLogs] (
  [ID] [int] IDENTITY(1,1) NOT NULL,
  [Islem_Tipi] [nvarchar](50) NOT NULL,
  [Personel_Ad] [nvarchar](100) NOT NULL,
  [Sicil_No] [nvarchar](50) NULL,
  [Detay] [nvarchar](max) NULL,
  [Tarih] [datetime] NULL CONSTRAINT [DF_SystemLogs_Tarih] DEFAULT (getdate()),
  [Islemi_Yapan] [nvarchar](100) NULL CONSTRAINT [DF_SystemLogs_Islemi_Yapan] DEFAULT ('Sistem'),
  CONSTRAINT [PK_SystemLogs] PRIMARY KEY ([ID])
);
END;

IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
BEGIN
CREATE TABLE [dbo].[Users] (
  [ID] [int] IDENTITY(1,1) NOT NULL,
  [Ad_Soyad] [nvarchar](100) NOT NULL,
  [RFID_Kart_No] [nvarchar](50) NOT NULL,
  [Durum] [bit] NULL CONSTRAINT [DF_Users_Durum] DEFAULT ((1)),
  [TC_Kimlik] [nvarchar](11) NULL,
  [Sicil_No] [nvarchar](50) NULL,
  [Sirket] [nvarchar](100) NULL,
  [Departman] [nvarchar](100) NULL,
  [Gorev] [nvarchar](100) NULL,
  [Sistem_ID] [nvarchar](11) NULL,
  [Ise_Giris_Tarihi] [date] NULL,
  [Isten_Cikis_Tarihi] [date] NULL,
  [Cikis_Nedeni] [nvarchar](255) NULL,
  CONSTRAINT [PK_Users] PRIMARY KEY ([ID])
);
END;

IF OBJECT_ID(N'dbo.Vardiyalar', N'U') IS NULL
BEGIN
CREATE TABLE [dbo].[Vardiyalar] (
  [ID] [int] IDENTITY(1,1) NOT NULL,
  [Vardiya_Adi] [nvarchar](100) NOT NULL,
  [Mesai_Baslangic] [time] NOT NULL,
  [Mesai_Bitis] [time] NOT NULL,
  [Yemek_Baslangic] [time] NULL,
  [Yemek_Bitis] [time] NULL,
  [Tolerans_Dk] [int] NULL CONSTRAINT [DF_Vardiyalar_Tolerans_Dk] DEFAULT ((0)),
  [Mola_Hakki_Dk] [int] NULL CONSTRAINT [DF_Vardiyalar_Mola_Hakki_Dk] DEFAULT ((0)),
  [Durum] [bit] NULL CONSTRAINT [DF_Vardiyalar_Durum] DEFAULT ((1)),
  [Calisma_Gunleri] [nvarchar](50) NULL CONSTRAINT [DF_Vardiyalar_Calisma_Gunleri] DEFAULT ('1,2,3,4,5'),
  CONSTRAINT [PK_Vardiyalar] PRIMARY KEY ([ID])
);
END;

IF OBJECT_ID(N'dbo.Yoneticiler', N'U') IS NULL
BEGIN
CREATE TABLE [dbo].[Yoneticiler] (
  [ID] [int] IDENTITY(1,1) NOT NULL,
  [Kullanici_Adi] [varchar](50) NOT NULL,
  [Sifre_Hash] [varchar](255) NOT NULL,
  [Rol] [varchar](20) NULL CONSTRAINT [DF_Yoneticiler_Rol] DEFAULT ('admin'),
  [Olusturulma_Tarihi] [datetime] NULL CONSTRAINT [DF_Yoneticiler_Olusturulma_Tarihi] DEFAULT (getdate()),
  CONSTRAINT [PK_Yoneticiler] PRIMARY KEY ([ID])
);
END;

IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name=N'UQ_Mesai_Onayi' AND object_id=OBJECT_ID(N'dbo.Mesai_Onaylari')) CREATE UNIQUE INDEX [UQ_Mesai_Onayi] ON [dbo].[Mesai_Onaylari]([User_ID],[Tarih]);

IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name=N'UQ__Users__09FCEDD9458EF37C' AND object_id=OBJECT_ID(N'dbo.Users')) CREATE UNIQUE INDEX [UQ__Users__09FCEDD9458EF37C] ON [dbo].[Users]([RFID_Kart_No]);

IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name=N'UQ__Yonetici__E1FCC656A826C809' AND object_id=OBJECT_ID(N'dbo.Yoneticiler')) CREATE UNIQUE INDEX [UQ__Yonetici__E1FCC656A826C809] ON [dbo].[Yoneticiler]([Kullanici_Adi]);

IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE name=N'FK__Izinler__User_ID__04E4BC85') ALTER TABLE [dbo].[Izinler] ADD CONSTRAINT [FK__Izinler__User_ID__04E4BC85] FOREIGN KEY ([User_ID]) REFERENCES [dbo].[Users]([ID]) ON DELETE CASCADE;

IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE name=N'FK__Permissio__User___3D5E1FD2') ALTER TABLE [dbo].[Permissions] ADD CONSTRAINT [FK__Permissio__User___3D5E1FD2] FOREIGN KEY ([User_ID]) REFERENCES [dbo].[Users]([ID]) ON DELETE CASCADE;

IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE name=N'FK__Permissio__Door___3E52440B') ALTER TABLE [dbo].[Permissions] ADD CONSTRAINT [FK__Permissio__Door___3E52440B] FOREIGN KEY ([Door_ID]) REFERENCES [dbo].[Doors]([ID]) ON DELETE CASCADE;

IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE name=N'FK__Logs__Door_ID__4222D4EF') ALTER TABLE [dbo].[Logs] ADD CONSTRAINT [FK__Logs__Door_ID__4222D4EF] FOREIGN KEY ([Door_ID]) REFERENCES [dbo].[Doors]([ID]) ON DELETE NO ACTION;

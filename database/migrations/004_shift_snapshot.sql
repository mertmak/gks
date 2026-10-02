-- Existing assignments freeze the currently available definition.
-- Previously overwritten definitions cannot be recovered.
ALTER TABLE dbo.Personel_Vardiya ADD Snapshot_Vardiya_Adi nvarchar(100) NULL,
    Snapshot_Mesai_Baslangic time NULL,
    Snapshot_Mesai_Bitis time NULL,
    Snapshot_Calisma_Gunleri nvarchar(50) NULL,
    Snapshot_Tolerans_Dk int NULL,
    Snapshot_Mola_Hakki_Dk int NULL,
    Snapshot_Yemek_Baslangic time NULL,
    Snapshot_Yemek_Bitis time NULL;
EXEC(N'UPDATE P SET Snapshot_Vardiya_Adi=V.Vardiya_Adi, Snapshot_Mesai_Baslangic=V.Mesai_Baslangic, Snapshot_Mesai_Bitis=V.Mesai_Bitis, Snapshot_Calisma_Gunleri=V.Calisma_Gunleri, Snapshot_Tolerans_Dk=V.Tolerans_Dk, Snapshot_Mola_Hakki_Dk=V.Mola_Hakki_Dk, Snapshot_Yemek_Baslangic=V.Yemek_Baslangic, Snapshot_Yemek_Bitis=V.Yemek_Bitis FROM dbo.Personel_Vardiya P JOIN dbo.Vardiyalar V ON V.ID=P.Vardiya_ID');
EXEC(N'CREATE TRIGGER dbo.TR_PersonelVardiya_Snapshot ON dbo.Personel_Vardiya AFTER INSERT AS
BEGIN
    SET NOCOUNT ON;
    UPDATE P SET Snapshot_Vardiya_Adi=V.Vardiya_Adi, Snapshot_Mesai_Baslangic=V.Mesai_Baslangic, Snapshot_Mesai_Bitis=V.Mesai_Bitis, Snapshot_Calisma_Gunleri=V.Calisma_Gunleri, Snapshot_Tolerans_Dk=V.Tolerans_Dk, Snapshot_Mola_Hakki_Dk=V.Mola_Hakki_Dk, Snapshot_Yemek_Baslangic=V.Yemek_Baslangic, Snapshot_Yemek_Bitis=V.Yemek_Bitis
    FROM dbo.Personel_Vardiya P JOIN inserted I ON I.ID=P.ID
    JOIN dbo.Vardiyalar V ON V.ID=I.Vardiya_ID;
END');

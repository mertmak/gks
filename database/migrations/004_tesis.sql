-- Facility model: floors, polygon areas, one-way doors and the meaning of a
-- passage. An installation that already has areas gets a ground floor and
-- its rectangles become four-point polygons; nothing else changes.
CREATE TABLE katlar (
    id integer GENERATED ALWAYS AS IDENTITY CONSTRAINT pk_katlar PRIMARY KEY,
    kat_adi varchar(100) NOT NULL,
    sira integer NOT NULL,
    -- Deferred: a whole-plan save may swap the order of two floors.
    CONSTRAINT uq_katlar_sira UNIQUE (sira) DEFERRABLE INITIALLY DEFERRED
);

INSERT INTO katlar (kat_adi, sira) SELECT 'Zemin Kat', 0 WHERE EXISTS (SELECT 1 FROM bolgeler);

ALTER TABLE bolgeler
    ADD COLUMN kat_id integer CONSTRAINT fk_bolgeler_kat REFERENCES katlar (id) ON DELETE CASCADE,
    ADD COLUMN noktalar jsonb,
    -- Stairs and lifts with the same group join their floors.
    ADD COLUMN dikey_grup varchar(40);

UPDATE bolgeler SET kat_id = (SELECT min(id) FROM katlar),
    noktalar = jsonb_build_array(jsonb_build_array(x, y), jsonb_build_array(x + genislik, y),
        jsonb_build_array(x + genislik, y + yukseklik), jsonb_build_array(x, y + yukseklik));

ALTER TABLE bolgeler
    ALTER COLUMN kat_id SET NOT NULL,
    ALTER COLUMN noktalar SET NOT NULL,
    DROP CONSTRAINT ck_bolgeler_alan,
    DROP CONSTRAINT ck_bolgeler_tur,
    DROP COLUMN x, DROP COLUMN y, DROP COLUMN genislik, DROP COLUMN yukseklik,
    ADD CONSTRAINT ck_bolgeler_tur CHECK (bolge_turu IN ('Lobi', 'Ofis', 'Yemekhane', 'Mola', 'Merdiven/Asansör', 'Üretim', 'Depo', 'Soyunma', 'Diğer')),
    ADD CONSTRAINT ck_bolgeler_noktalar CHECK (jsonb_typeof(noktalar) = 'array' AND jsonb_array_length(noktalar) BETWEEN 3 AND 40),
    ADD CONSTRAINT ck_bolgeler_dikey CHECK (dikey_grup IS NULL OR bolge_turu = 'Merdiven/Asansör');
CREATE INDEX ix_bolgeler_kat ON bolgeler (kat_id);

-- A turnstile lets people through one way only (A = Bolge_A side).
ALTER TABLE doors ADD COLUMN yon_kisiti varchar(10) NOT NULL DEFAULT 'Çift'
    CONSTRAINT ck_doors_yon CHECK (yon_kisiti IN ('Çift', 'A→B', 'B→A'));

-- Meaning of an accepted read from the areas it joined, frozen at capture
-- time like User_ID: later plan changes never rewrite past attendance. NULL
-- (doors off the plan, older reads) falls back to the door's type.
ALTER TABLE logs ADD COLUMN gecis_anlami varchar(30)
    CONSTRAINT ck_logs_anlam CHECK (gecis_anlami IN ('Ana Giriş', 'Ana Çıkış', 'İç Geçiş', 'Yemekhane Giriş', 'Yemekhane Çıkış', 'Mola / Sigara Alanı'));

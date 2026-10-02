-- GKS PostgreSQL base schema. Equivalent to the final SQL Server schema
-- (migrations 001-005, tag v1-mssql-son). Unquoted names fold to lower case;
-- the backend maps result keys back to their canonical spelling.
-- Stored timestamps are Turkey local wall-clock time without a zone.

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;

-- Case-insensitive comparison for identifiers people type (user name, card
-- and registry numbers). Root ICU rules fold I/i like the previous database;
-- Turkish rules would turn 'ADMIN' into 'admın'.
CREATE FUNCTION gks_ci(value text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
    RETURN lower(value COLLATE "und-x-icu");

-- Case- and accent-insensitive search: 'ISIK' finds 'Işık', 'isci' finds 'İŞÇİ'.
-- unaccent maps Turkish letters to ASCII first, so lower() needs no locale.
CREATE FUNCTION gks_search(value text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
    RETURN lower(public.unaccent('public.unaccent'::regdictionary, value) COLLATE "C");

CREATE TABLE doors (
    id integer GENERATED ALWAYS AS IDENTITY CONSTRAINT pk_doors PRIMARY KEY,
    kapi_adi varchar(100) NOT NULL,
    departman varchar(255),
    konum varchar(255),
    durum boolean DEFAULT true,
    kapi_turu varchar(50) DEFAULT 'İç Geçiş'
);

CREATE TABLE doorlogs (
    id integer GENERATED ALWAYS AS IDENTITY CONSTRAINT pk_doorlogs PRIMARY KEY,
    islem_tipi varchar(50) NOT NULL,
    kapi_adi varchar(100) NOT NULL,
    detay text,
    tarih timestamp(3) DEFAULT LOCALTIMESTAMP,
    islemi_yapan varchar(100) DEFAULT 'Sistem'
);

CREATE TABLE users (
    id integer GENERATED ALWAYS AS IDENTITY CONSTRAINT pk_users PRIMARY KEY,
    ad_soyad varchar(100) NOT NULL,
    rfid_kart_no varchar(50) NOT NULL,
    durum boolean DEFAULT true,
    tc_kimlik varchar(11),
    sicil_no varchar(50),
    sirket varchar(100),
    departman varchar(100),
    gorev varchar(100),
    sistem_id varchar(11),
    ise_giris_tarihi date,
    isten_cikis_tarihi date,
    cikis_nedeni varchar(255)
);
CREATE UNIQUE INDEX ux_users_rfid ON users (gks_ci(rfid_kart_no));
CREATE UNIQUE INDEX ux_users_tc ON users (tc_kimlik) WHERE tc_kimlik IS NOT NULL AND tc_kimlik <> '';
CREATE UNIQUE INDEX ux_users_sicil ON users (gks_ci(sicil_no)) WHERE sicil_no IS NOT NULL AND sicil_no <> '';
CREATE UNIQUE INDEX ux_users_sistem ON users (sistem_id) WHERE sistem_id IS NOT NULL AND sistem_id <> '';

CREATE TABLE izinler (
    id integer GENERATED ALWAYS AS IDENTITY CONSTRAINT pk_izinler PRIMARY KEY,
    user_id integer NOT NULL CONSTRAINT fk_izinler_user REFERENCES users (id) ON DELETE CASCADE,
    izin_turu varchar(50) NOT NULL,
    baslangic_tarihi date NOT NULL,
    bitis_tarihi date NOT NULL,
    aciklama varchar(255),
    durum varchar(20) DEFAULT 'Onaylandı',
    olusturulma_tarihi timestamp(3) DEFAULT LOCALTIMESTAMP,
    CONSTRAINT ck_leave_dates CHECK (bitis_tarihi >= baslangic_tarihi)
);

CREATE TABLE logs (
    id integer GENERATED ALWAYS AS IDENTITY CONSTRAINT pk_logs PRIMARY KEY,
    rfid_kart_no varchar(50) NOT NULL,
    door_id integer NOT NULL CONSTRAINT fk_logs_door REFERENCES doors (id) ON DELETE NO ACTION,
    zaman timestamp(3) DEFAULT LOCALTIMESTAMP,
    basarili_mi boolean NOT NULL,
    user_id integer CONSTRAINT fk_logs_user REFERENCES users (id)
);
CREATE INDEX ix_logs_card_time ON logs (rfid_kart_no, zaman) INCLUDE (door_id, basarili_mi);
CREATE INDEX ix_logs_time ON logs (zaman) INCLUDE (rfid_kart_no, door_id, basarili_mi);
CREATE INDEX ix_logs_user_time ON logs (user_id, zaman) INCLUDE (door_id, basarili_mi, rfid_kart_no);

-- Freeze the owner at capture time. Unmatched cards stay unassigned
-- permanently; later card registration must not claim old events.
CREATE FUNCTION tr_logs_capture_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.user_id := (SELECT u.id FROM users u WHERE gks_ci(u.rfid_kart_no) = gks_ci(NEW.rfid_kart_no));
    RETURN NEW;
END;
$$;
CREATE TRIGGER tr_logs_capture_owner BEFORE INSERT ON logs
    FOR EACH ROW EXECUTE FUNCTION tr_logs_capture_owner();

CREATE TABLE mesai_onaylari (
    id integer GENERATED ALWAYS AS IDENTITY CONSTRAINT pk_mesai_onaylari PRIMARY KEY,
    user_id integer NOT NULL CONSTRAINT fk_overtime_user REFERENCES users (id),
    tarih date NOT NULL,
    hesaplanan_dk integer NOT NULL,
    onaylanan_dk integer,
    durum varchar(50) DEFAULT 'Bekliyor',
    aciklama varchar(255),
    islemi_yapan varchar(100),
    islem_zamani timestamp(3) DEFAULT LOCALTIMESTAMP,
    CONSTRAINT ck_overtime_minutes CHECK (hesaplanan_dk >= 0 AND (onaylanan_dk IS NULL OR onaylanan_dk >= 0))
);
CREATE UNIQUE INDEX ux_mesai_onayi ON mesai_onaylari (user_id, tarih);

CREATE TABLE permissions (
    id integer GENERATED ALWAYS AS IDENTITY CONSTRAINT pk_permissions PRIMARY KEY,
    user_id integer NOT NULL CONSTRAINT fk_permissions_user REFERENCES users (id) ON DELETE CASCADE,
    door_id integer NOT NULL CONSTRAINT fk_permissions_door REFERENCES doors (id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX ux_permissions_user_door ON permissions (user_id, door_id);

CREATE TABLE vardiyalar (
    id integer GENERATED ALWAYS AS IDENTITY CONSTRAINT pk_vardiyalar PRIMARY KEY,
    vardiya_adi varchar(100) NOT NULL,
    mesai_baslangic time NOT NULL,
    mesai_bitis time NOT NULL,
    yemek_baslangic time,
    yemek_bitis time,
    tolerans_dk integer DEFAULT 0,
    mola_hakki_dk integer DEFAULT 0,
    durum boolean DEFAULT true,
    calisma_gunleri varchar(50) DEFAULT '1,2,3,4,5'
);

-- Snapshot_* columns keep the shift definition valid at assignment time.
CREATE TABLE personel_vardiya (
    id integer GENERATED ALWAYS AS IDENTITY CONSTRAINT pk_personel_vardiya PRIMARY KEY,
    user_id integer NOT NULL CONSTRAINT fk_pv_user REFERENCES users (id),
    vardiya_id integer NOT NULL CONSTRAINT fk_pv_shift REFERENCES vardiyalar (id),
    baslangic_tarihi date DEFAULT CURRENT_DATE,
    bitis_tarihi date,
    snapshot_vardiya_adi varchar(100),
    snapshot_mesai_baslangic time,
    snapshot_mesai_bitis time,
    snapshot_calisma_gunleri varchar(50),
    snapshot_tolerans_dk integer,
    snapshot_mola_hakki_dk integer,
    snapshot_yemek_baslangic time,
    snapshot_yemek_bitis time,
    CONSTRAINT ck_shift_dates CHECK (bitis_tarihi IS NULL OR bitis_tarihi >= baslangic_tarihi)
);
CREATE UNIQUE INDEX ux_personel_vardiya_open ON personel_vardiya (user_id) WHERE bitis_tarihi IS NULL;
CREATE INDEX ix_personel_vardiya_history ON personel_vardiya (user_id, baslangic_tarihi DESC, id DESC) INCLUDE (vardiya_id, bitis_tarihi);

CREATE FUNCTION tr_personel_vardiya_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    SELECT v.vardiya_adi, v.mesai_baslangic, v.mesai_bitis, v.calisma_gunleri,
           v.tolerans_dk, v.mola_hakki_dk, v.yemek_baslangic, v.yemek_bitis
      INTO NEW.snapshot_vardiya_adi, NEW.snapshot_mesai_baslangic, NEW.snapshot_mesai_bitis, NEW.snapshot_calisma_gunleri,
           NEW.snapshot_tolerans_dk, NEW.snapshot_mola_hakki_dk, NEW.snapshot_yemek_baslangic, NEW.snapshot_yemek_bitis
      FROM vardiyalar v WHERE v.id = NEW.vardiya_id;
    RETURN NEW;
END;
$$;
CREATE TRIGGER tr_personel_vardiya_snapshot BEFORE INSERT ON personel_vardiya
    FOR EACH ROW EXECUTE FUNCTION tr_personel_vardiya_snapshot();

-- Closed periods are archived when a person starts a new employment period.
-- Users retains the current/latest period for existing management screens.
CREATE TABLE personel_calisma_gecmisi (
    id integer GENERATED ALWAYS AS IDENTITY CONSTRAINT pk_personel_calisma_gecmisi PRIMARY KEY,
    user_id integer NOT NULL CONSTRAINT fk_calisma_gecmisi_user REFERENCES users (id),
    baslangic_tarihi date,
    bitis_tarihi date NOT NULL,
    cikis_nedeni varchar(255),
    CONSTRAINT ck_calisma_gecmisi_dates CHECK (baslangic_tarihi IS NULL OR bitis_tarihi >= baslangic_tarihi)
);
CREATE INDEX ix_calisma_gecmisi_user_dates ON personel_calisma_gecmisi (user_id, baslangic_tarihi, bitis_tarihi);

CREATE TABLE systemlogs (
    id integer GENERATED ALWAYS AS IDENTITY CONSTRAINT pk_systemlogs PRIMARY KEY,
    islem_tipi varchar(50) NOT NULL,
    personel_ad varchar(100) NOT NULL,
    sicil_no varchar(50),
    detay text,
    tarih timestamp(3) DEFAULT LOCALTIMESTAMP,
    islemi_yapan varchar(100) DEFAULT 'Sistem'
);

-- Panel accounts (admin/user); unrelated to personnel in users.
CREATE TABLE yoneticiler (
    id integer GENERATED ALWAYS AS IDENTITY CONSTRAINT pk_yoneticiler PRIMARY KEY,
    kullanici_adi varchar(50) NOT NULL,
    sifre_hash varchar(255) NOT NULL,
    rol varchar(20) DEFAULT 'admin',
    olusturulma_tarihi timestamp(3) DEFAULT LOCALTIMESTAMP,
    token_version integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX ux_yoneticiler_kullanici_adi ON yoneticiler (gks_ci(kullanici_adi));

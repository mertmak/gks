-- Annual leave carry-over: the remaining annual leave on izin_devir_tarihi.
-- Entitlement from later service anniversaries and annual leave on or after that date are added on top.
ALTER TABLE users
    ADD COLUMN izin_devir_gun integer,
    ADD COLUMN izin_devir_tarihi date,
    ADD CONSTRAINT ck_users_izin_devri CHECK ((izin_devir_gun IS NULL) = (izin_devir_tarihi IS NULL)
        AND (izin_devir_gun IS NULL OR izin_devir_gun BETWEEN -365 AND 365));

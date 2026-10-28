-- Registry of per-visitor simulation schemas (sbx_<16 hex>) on the public demo.
-- Each schema holds its own copy of the business tables and is dropped when
-- Bitis passes. Applied into a sandbox schema too; the copy there is removed.
CREATE TABLE gkssandboxes (
    id integer GENERATED ALWAYS AS IDENTITY CONSTRAINT pk_gkssandboxes PRIMARY KEY,
    schema_adi varchar(30) NOT NULL CONSTRAINT ux_gkssandboxes_schema UNIQUE,
    olusturulma timestamp(3) NOT NULL DEFAULT LOCALTIMESTAMP,
    bitis timestamp(3) NOT NULL,
    CONSTRAINT ck_gkssandboxes_schema CHECK (schema_adi ~ '^sbx_[0-9a-f]{16}$')
);
CREATE INDEX ix_gkssandboxes_bitis ON gkssandboxes (bitis);

-- Official holiday calendar. A shift day on one of these dates counts as a
-- holiday like a weekly rest day: absence is "Resmi Tatil", work is holiday overtime.
CREATE TABLE resmi_tatiller (
    id integer GENERATED ALWAYS AS IDENTITY CONSTRAINT pk_resmi_tatiller PRIMARY KEY,
    tarih date NOT NULL CONSTRAINT uq_resmi_tatiller_tarih UNIQUE,
    tatil_adi varchar(100) NOT NULL
);

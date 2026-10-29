-- Floor plan for the door simulation: rectangular areas on a 2000 x 2000
-- grid and door positions on their borders. A door joins two areas; a NULL
-- side is the outside of the building. Plan columns stay NULL until a door
-- is placed, so existing doors and installations are unaffected.
CREATE TABLE bolgeler (
    id integer GENERATED ALWAYS AS IDENTITY CONSTRAINT pk_bolgeler PRIMARY KEY,
    bolge_adi varchar(100) NOT NULL,
    bolge_turu varchar(20) NOT NULL DEFAULT 'Diğer',
    x integer NOT NULL,
    y integer NOT NULL,
    genislik integer NOT NULL,
    yukseklik integer NOT NULL,
    CONSTRAINT ck_bolgeler_tur CHECK (bolge_turu IN ('Lobi', 'Ofis', 'Yemekhane', 'Mola', 'Diğer')),
    CONSTRAINT ck_bolgeler_alan CHECK (x >= 0 AND y >= 0 AND genislik >= 40 AND yukseklik >= 40
        AND x + genislik <= 2000 AND y + yukseklik <= 2000)
);

ALTER TABLE doors
    ADD COLUMN plan_x integer,
    ADD COLUMN plan_y integer,
    ADD COLUMN bolge_a_id integer CONSTRAINT fk_doors_bolge_a REFERENCES bolgeler (id) ON DELETE SET NULL,
    ADD COLUMN bolge_b_id integer CONSTRAINT fk_doors_bolge_b REFERENCES bolgeler (id) ON DELETE SET NULL,
    ADD CONSTRAINT ck_doors_plan CHECK ((plan_x IS NULL) = (plan_y IS NULL)
        AND (plan_x IS NULL OR (plan_x BETWEEN 0 AND 2000 AND plan_y BETWEEN 0 AND 2000))
        AND (plan_x IS NOT NULL OR (bolge_a_id IS NULL AND bolge_b_id IS NULL))
        AND bolge_a_id <> bolge_b_id);

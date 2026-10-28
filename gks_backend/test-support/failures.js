// Test fixture: every INSERT into `table` fails with `message` until restored.
const fixtureName = table => {
    if (!/^[A-Za-z_]+$/.test(table)) throw new Error('Invalid fixture table.');
    return `fixture_fail_${table.toLowerCase()}`;
};

async function failInsertsOn(sql, table, message) {
    const name = fixtureName(table);
    await sql.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION '${message.replaceAll("'", "''")}'; END $$;
        CREATE TRIGGER ${name} BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION ${name}();`);
    return () => restoreInserts(sql, table);
}

async function restoreInserts(sql, table) {
    const name = fixtureName(table);
    await sql.query(`DROP TRIGGER ${name} ON ${table}; DROP FUNCTION ${name}();`);
}
module.exports = { failInsertsOn, restoreInserts };

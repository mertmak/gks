// PostgreSQL SQLSTATE codes for constraint violations.
const isUniqueViolation = error => error?.code === '23505';
const isForeignKeyViolation = error => error?.code === '23503';
const isCheckViolation = error => error?.code === '23514';
module.exports = { isUniqueViolation, isForeignKeyViolation, isCheckViolation };

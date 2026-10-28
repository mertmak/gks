// The generator's default template: the oldest active day shift (start before
// end), so a first run matches the usual daytime assignments. /shifts lists
// newest first; night shifts are used only when no day shift exists.
const minutes = value => {
  const text = String(value ?? '');
  const match = text.match(/T(\d{2}):(\d{2})/) || text.match(/^(\d{2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};
export const isDayShift = shift => {
  const start = minutes(shift.Mesai_Baslangic), end = minutes(shift.Mesai_Bitis);
  return start !== null && end !== null && start < end;
};
export const defaultTemplateShift = shifts => {
  const byAge = [...shifts].sort((a, b) => a.ID - b.ID);
  return byAge.find(isDayShift) ?? byAge[0] ?? null;
};

const WEEKDAYS = ['sun','mon','tue','wed','thu','fri','sat'];

function validTimezone(timezone) {
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(); return true; } catch { return false; }
}

function minutes(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const total = Number(match[1]) * 60 + Number(match[2]);
  return total >= 0 && total < 1440 ? total : null;
}

function slotsForDay({ date, weekday, startTime, endTime, durationMinutes, intervalMinutes = durationMinutes }) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || WEEKDAYS[parsed.getUTCDay()] !== weekday) return [];
  const start = minutes(startTime); const end = minutes(endTime);
  if (start === null || end === null || end <= start || durationMinutes < 15) return [];
  const slots = [];
  for (let cursor = start; cursor + durationMinutes <= end; cursor += intervalMinutes) {
    slots.push(`${String(Math.floor(cursor / 60)).padStart(2, '0')}:${String(cursor % 60).padStart(2, '0')}`);
  }
  return slots;
}

function zonedDateTimeToUtc(date, time, timezone) {
  if (!validTimezone(timezone) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || minutes(time) === null) return null;
  const [year, month, day] = date.split('-').map(Number); const [hour, minute] = time.split(':').map(Number);
  let candidate = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  for (let index = 0; index < 3; index += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate)).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    candidate += Date.UTC(year, month - 1, day, hour, minute) - represented;
  }
  return new Date(candidate);
}

function localDateTime(instant, timezone) {
  if (!validTimezone(timezone)) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(instant).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, weekday: parts.weekday.toLowerCase().slice(0, 3) };
}

module.exports = { WEEKDAYS, validTimezone, minutes, slotsForDay, zonedDateTimeToUtc, localDateTime };

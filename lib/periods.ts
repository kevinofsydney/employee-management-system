const dayInMs = 1000 * 60 * 60 * 24;

export const getStartOfPayPeriod = (date: Date, startDay = 1) => {
  const current = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const distance = (current.getUTCDay() - startDay + 7) % 7;
  current.setUTCDate(current.getUTCDate() - distance);
  current.setUTCHours(0, 0, 0, 0);
  return current;
};

export const getPayPeriodRange = (date: Date, startDay = 1) => {
  const start = getStartOfPayPeriod(date, startDay);
  const end = new Date(start.getTime() + dayInMs * 6);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
};

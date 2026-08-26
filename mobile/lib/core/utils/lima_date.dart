// lima_date.dart — Día calendario en hora de Lima (UTC-5)
DateTime limaDay(DateTime utcDateTime) {
  final lima = utcDateTime.toUtc().subtract(const Duration(hours: 5));
  return DateTime(lima.year, lima.month, lima.day);
}

DateTime limaToday() => limaDay(DateTime.now().toUtc());


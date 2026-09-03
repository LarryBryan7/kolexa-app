// staleness_guard.dart — guard de "respuesta obsoleta" (B1)

const _defaultKey = '_default';

class StalenessGuard {
  int _accountEpoch = 0;
  final Map<String, int> _sequenceByKey = {};

  int beginAccountEpoch() => _accountEpoch;

  bool isAccountCurrent(int epoch) => epoch == _accountEpoch;

  int beginSequence([String key = _defaultKey]) {
    final next = (_sequenceByKey[key] ?? 0) + 1;
    _sequenceByKey[key] = next;
    return next;
  }

  bool isCurrent(int epoch, int seq, [String key = _defaultKey]) =>
      isAccountCurrent(epoch) && seq == (_sequenceByKey[key] ?? 0);

  void invalidateAccount() {
    _accountEpoch++;
    _sequenceByKey.clear();
  }
}

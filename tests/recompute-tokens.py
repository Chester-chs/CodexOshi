"""Independent acceptance recomputation. No runtime JS or stored deltas reused.
Read only each captured file size, and output numeric aggregates/type counts.
"""
import datetime, json, os, sys, time
index_path, codex_home, output = sys.argv[1:4]
with open(index_path, encoding='utf-8') as source:
    captured = json.load(source)
cutoff = captured['lastRefreshAt']
totals = {'hours24': 0, 'days7': 0, 'days30': 0}
sizes = {'hours24': 86400000, 'days7': 604800000, 'days30': 2592000000}
maximum_sum = records = bytes_read = 0
oversized_types = {}
started = time.perf_counter()
root = os.path.realpath(os.path.join(codex_home, 'sessions'))
for relative, metadata in captured['files'].items():
    filename = os.path.realpath(os.path.join(root, relative))
    if os.path.commonpath([root, filename]) != root or not filename.endswith('.jsonl'):
        raise ValueError('unsafe captured path')
    high = 0
    with open(filename, 'rb') as source:
        remaining = metadata['size']
        while remaining:
            line = source.readline(remaining)
            if not line:
                break
            remaining -= len(line)
            bytes_read += len(line)
            oversized = len(line) > 1024 * 1024
            if b'"token_count"' not in line and not oversized:
                continue
            try:
                event = json.loads(line)
            except (ValueError, UnicodeDecodeError):
                continue
            if oversized:
                kind = event.get('type', 'unknown')
                if kind == 'event_msg':
                    kind += '/' + str((event.get('payload') or {}).get('type'))
                oversized_types[kind] = oversized_types.get(kind, 0) + 1
            payload = event.get('payload') or {}
            if event.get('type') != 'event_msg' or payload.get('type') != 'token_count':
                continue
            count = ((payload.get('info') or {}).get('total_token_usage') or {}).get('total_tokens')
            if not isinstance(count, int) or isinstance(count, bool) or count < 0:
                continue
            delta = max(0, count - high)
            high = max(high, count)
            records += 1
            try:
                stamp = datetime.datetime.fromisoformat(event['timestamp'].replace('Z', '+00:00')).timestamp() * 1000
            except (KeyError, ValueError, TypeError):
                continue
            for name, window in sizes.items():
                if 0 <= cutoff - stamp <= window:
                    totals[name] += delta
    maximum_sum += high
result = {'asOf': cutoff, 'files': len(captured['files']), 'values': totals, 'highWaterTotal': maximum_sum,
          'tokenRecords': records, 'bytesRead': bytes_read, 'oversizedTypes': oversized_types,
          'elapsedMs': round((time.perf_counter() - started) * 1000)}
with open(output, 'w', encoding='utf-8') as target:
    json.dump(result, target, ensure_ascii=False, indent=2)
print(json.dumps(result, ensure_ascii=False))

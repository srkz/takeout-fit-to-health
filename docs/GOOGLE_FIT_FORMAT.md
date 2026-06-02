# Google Fit (Takeout) export format

Exported via [Google Takeout](https://takeout.google.com) → **Fit**. Even when
you choose "JSON", a Fit export is **mixed-format**. Top-level layout:

```
Takeout/
  Fit/
    All Data/                  *.json   ← rich time-series (what we import)
    All Sessions/              *.json   ← one workout per file (what we import)
    Daily activity metrics/    *.csv    ← daily rollups (skipped: duplicates)
    Activities/                *.tcx    ← GPS tracks (skipped in v1)
  archive_browser.html
```

The `Fit` folder name and some labels are **localized**, so the Worker routes by
matching the folder name case-insensitively anywhere in the path rather than
assuming an English, `Takeout/Fit/...` prefix.

## `All Data/*.json`

One file per data stream. Filenames look like
`derived_com.google.step_count.delta_...json`.

```jsonc
{
  "Data Source": "raw:com.google.step_count.delta:com.google.android.gms:...",
  "Data Points": [
    {
      "fitValue": [ { "value": { "intVal": 123 } } ],   // or { "fpVal": 72.5 }
      "startTimeNanos": "1619856000000000000",          // nanoseconds since epoch
      "endTimeNanos":   "1619856060000000000",
      "dataTypeName":   "com.google.step_count.delta"
    }
  ]
}
```

Notes the parser handles:

- `startTimeNanos`/`endTimeNanos` may be **strings or numbers**; both coerced.
  Nanoseconds → milliseconds (`/ 1e6`) → ISO-8601 UTC.
- The value lives in `fitValue[0].value` as `intVal` (counts) or `fpVal`
  (floats); which one depends on the data type (see `mapping.ts`).
- `dataTypeName` may be absent on a point; we fall back to the type parsed from
  the `Data Source` id.
- Cumulative samples with value `0` (steps, distance) are dropped as noise.

### Units (as Google Fit reports them)

| Data type | Field | Unit |
| --- | --- | --- |
| `com.google.step_count.delta` | `intVal` | count |
| `com.google.heart_rate.bpm` | `fpVal` | bpm |
| `com.google.weight` | `fpVal` | kilograms |
| `com.google.calories.expended` | `fpVal` | kilocalories |
| `com.google.distance.delta` | `fpVal` | meters |

## `All Sessions/*.json`

One workout session per file:

```jsonc
{
  "fitnessActivity": "running",
  "startTime": "2021-05-01T08:00:00.000+02:00",   // may be non-UTC; normalized
  "endTime":   "2021-05-01T08:30:00.000+02:00",
  "aggregate": [
    { "metricName": "com.google.calories.expended", "floatValue": 200.5 },
    { "metricName": "com.google.distance.delta",     "floatValue": 3000 }
  ]
}
```

`fitnessActivity` is mapped to an `HKWorkoutActivityType` (e.g. `biking` →
`cycling`); unknown values fall back to `other`. Sessions with non-positive
duration are skipped.

## Sources

- Google Fit — Download your data: https://support.google.com/fit/answer/3024190
- How to export your Google Fit data: https://www.howtogeek.com/694075/how-to-export-your-google-fit-data/
- Google Fit activity data types: https://developers.google.com/fit/datatypes/activity

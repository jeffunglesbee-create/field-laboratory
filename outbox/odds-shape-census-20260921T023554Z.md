# Odds shape census

Run: https://github.com/jeffunglesbee-create/field-laboratory/actions/runs/35554699423
Probed at 2026-09-21 02:35 UTC against the live relay.

Raw payload, not decoded — see scripts/odds-shape-census.mjs on why.

## 2026-09-20

```
source:   https://field-relay-nba.jeffunglesbee.workers.dev/context/date/2026-09-20
games at: games.regular  (75 row(s))
odds keys probed: opening_odds, closing_odds

── spread ──
  26 value(s) of `spread` across 52 odds snapshot(s) on 75 game row(s).
  nested payload states: absent=98 parsed=52
    26×  {away,awayPrice,home,homePrice}
        sports: MLB, WNBA, wnba
        from:   MLB MLB_2026-09-20_e401817017 opening_odds
        verbatim: {"home":1.5,"away":-1.5,"homePrice":-122,"awayPrice":101}

── total ──
  26 value(s) of `total` across 52 odds snapshot(s) on 75 game row(s).
  nested payload states: absent=98 parsed=52
    26×  {over,under}
        sports: MLB, WNBA, wnba
        from:   MLB MLB_2026-09-20_e401817017 opening_odds
        verbatim: {"over":8,"under":8}

── moneyline ──
  51 value(s) of `moneyline` across 52 odds snapshot(s) on 75 game row(s).
  nested payload states: absent=98 parsed=52
    26×  {away,draw,home}
        sports: EPL, La Liga, Ligue 1, MLS, Serie A
        from:   MLS 2026-09-20-mls-mia-sd opening_odds
        verbatim: {"home":-230,"away":425,"draw":425}
    25×  {away,home}
        sports: MLB, WNBA
        from:   MLB MLB_2026-09-20_e401817017 opening_odds
        verbatim: {"home":141,"away":-171}

── every key any odds snapshot carries (the control) ──
  source=52 captured_at=52 _oddsProof=52 moneyline=51 spread=26 total=26 _kickoff=16
exit=0
```

## 2026-09-19

```
source:   https://field-relay-nba.jeffunglesbee.workers.dev/context/date/2026-09-19
games at: games.regular  (141 row(s))
odds keys probed: opening_odds, closing_odds

── spread ──
  35 value(s) of `spread` across 161 odds snapshot(s) on 141 game row(s).
  nested payload states: absent=121 parsed=161
    35×  {away,awayPrice,home,homePrice}
        sports: CFL, MLB, WNBA, wnba
        from:   MLB MLB_2026-09-19_e401817004 opening_odds
        verbatim: {"home":-1.5,"away":1.5,"homePrice":153,"awayPrice":-186}

── total ──
  110 value(s) of `total` across 161 odds snapshot(s) on 141 game row(s).
  nested payload states: absent=121 parsed=161
   110×  {over,under}
        sports: CFB, CFL, MLB, MLS, WNBA
        from:   MLS 2026-09-19-mls-ne-orl closing_odds
        verbatim: {"over":3.5,"under":3.5}

── moneyline ──
  160 value(s) of `moneyline` across 161 odds snapshot(s) on 141 game row(s).
  nested payload states: absent=121 parsed=161
   106×  {away,home}
        sports: CFB, CFL, MLB, WNBA
        from:   MLB MLB_2026-09-19_e401817004 opening_odds
        verbatim: {"home":-137,"away":114}
    54×  {away,draw,home}
        sports: EPL, La Liga, Ligue 1, MLS, Serie A
        from:   MLS 2026-09-19-mls-sj-lafc opening_odds
        verbatim: {"home":190,"away":115,"draw":275}

── every key any odds snapshot carries (the control) ──
  source=161 captured_at=161 moneyline=160 _kickoff=114 total=110 _oddsProof=83 spread=35
exit=0
```

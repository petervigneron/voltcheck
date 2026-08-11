#!/bin/zsh
# Harvest EPA range data from fueleconomy.gov REST API
OUT=/private/tmp/claude-501/-Users-petervigneron-EV-site/787b47a6-542a-4275-a03e-99332b08a869/scratchpad/fe_ranges.tsv
ERR=/private/tmp/claude-501/-Users-petervigneron-EV-site/787b47a6-542a-4275-a03e-99332b08a869/scratchpad/fe_errors.log
: > $OUT
: > $ERR
BASE="https://www.fueleconomy.gov/ws/rest/vehicle"

fetch() { curl -s --max-time 25 --retry 2 "$@"; }

# combos: "year|make|grep-pattern"
combos=(
"2021|Volkswagen|ID.4"
"2022|Volkswagen|ID.4"
"2023|Volkswagen|ID.4"
"2024|Volkswagen|ID.4"
"2018|Nissan|LEAF|Leaf"
"2019|Nissan|LEAF|Leaf"
"2020|Nissan|LEAF|Leaf"
"2021|Nissan|LEAF|Leaf"
"2022|Nissan|LEAF|Leaf"
"2023|Nissan|LEAF|Leaf|ARIYA|Ariya"
"2024|Nissan|LEAF|Leaf|ARIYA|Ariya"
"2025|Nissan|LEAF|Leaf|ARIYA|Ariya"
"2023|Toyota|bZ4X|BZ4X"
"2024|Toyota|bZ4X|BZ4X"
"2025|Toyota|bZ4X|BZ4X"
"2023|Subaru|Solterra|SOLTERRA"
"2024|Subaru|Solterra|SOLTERRA"
"2025|Subaru|Solterra|SOLTERRA"
"2023|Cadillac|LYRIQ|Lyriq"
"2024|Cadillac|LYRIQ|Lyriq"
"2025|Cadillac|LYRIQ|Lyriq"
"2026|Cadillac|LYRIQ|Lyriq"
"2019|Kia|Niro"
"2020|Kia|Niro"
"2021|Kia|Niro"
"2022|Kia|Niro"
"2023|Kia|Niro"
"2024|Kia|Niro"
"2022|BMW|i4"
"2023|BMW|i4"
"2024|BMW|i4"
"2025|BMW|i4"
"2024|Honda|Prologue|PROLOGUE"
"2025|Honda|Prologue|PROLOGUE"
"2024|Chevrolet|Equinox EV|Blazer EV|Silverado EV"
"2025|Chevrolet|Equinox EV|Blazer EV|Silverado EV"
"2026|Chevrolet|Equinox EV|Blazer EV|Silverado EV"
"2019|Jaguar|I-Pace|I-PACE"
"2020|Jaguar|I-Pace|I-PACE"
"2021|Jaguar|I-Pace|I-PACE"
"2022|Jaguar|I-Pace|I-PACE"
"2023|Jaguar|I-Pace|I-PACE"
"2024|Jaguar|I-Pace|I-PACE"
"2022|GMC|Hummer|HUMMER"
"2023|GMC|Hummer|HUMMER"
"2024|GMC|Hummer|HUMMER"
"2025|GMC|Hummer|HUMMER"
)

for combo in "${combos[@]}"; do
  year="${combo%%|*}"
  rest="${combo#*|}"
  make="${rest%%|*}"
  pat="${rest#*|}"   # remaining pipe-separated patterns = egrep alternation
  menu=$(fetch -G "$BASE/menu/model" --data-urlencode "year=$year" --data-urlencode "make=$make")
  if [[ -z "$menu" ]]; then echo "MENU_FETCH_FAIL $year $make" >> $ERR; continue; fi
  # extract model values
  echo "$menu" | sed 's/<menuItem>/\n<menuItem>/g' | sed -n 's/.*<value>\(.*\)<\/value>.*/\1/p' | grep -E "$pat" | while IFS= read -r model; do
    opts=$(fetch -G "$BASE/menu/options" --data-urlencode "year=$year" --data-urlencode "make=$make" --data-urlencode "model=$model")
    if [[ -z "$opts" ]]; then echo "OPTS_FETCH_FAIL $year $make $model" >> $ERR; continue; fi
    echo "$opts" | sed 's/<menuItem>/\n<menuItem>/g' | sed -n 's/.*<value>\([0-9]*\)<\/value>.*/\1/p' | while read -r id; do
      [[ -z "$id" ]] && continue
      veh=$(fetch "$BASE/$id")
      if [[ -z "$veh" ]]; then echo "VEH_FETCH_FAIL $year $make $model $id" >> $ERR; continue; fi
      range=$(echo "$veh" | sed -n 's/.*<range>\([^<]*\)<\/range>.*/\1/p' | head -1)
      rangeCity=$(echo "$veh" | sed -n 's/.*<rangeCityA*>\([^<]*\)<.*/\1/p' | head -1)
      comb=$(echo "$veh" | sed -n 's/.*<comb08>\([^<]*\)<\/comb08>.*/\1/p' | head -1)
      drive=$(echo "$veh" | sed -n 's/.*<drive>\([^<]*\)<\/drive>.*/\1/p' | head -1)
      fuel=$(echo "$veh" | sed -n 's/.*<fuelType>\([^<]*\)<\/fuelType>.*/\1/p' | head -1)
      printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$year" "$make" "$model" "$id" "$range" "$comb" "$drive" "$fuel" >> $OUT
      sleep 0.1
    done
  done
done
echo "DONE" >> $OUT

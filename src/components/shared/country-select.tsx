/**
 * Shared country picker.
 *
 * TalVault's market is South Africa first, then the rest of Africa, so those
 * are grouped at the top; every other country follows alphabetically. The
 * stored value is the country name (plain text), which keeps it compatible
 * with the free-text columns already in the database.
 */

export const AFRICAN_COUNTRIES = [
  "South Africa",
  "Angola",
  "Botswana",
  "Democratic Republic of the Congo",
  "Egypt",
  "Eswatini",
  "Ethiopia",
  "Ghana",
  "Ivory Coast",
  "Kenya",
  "Lesotho",
  "Malawi",
  "Mauritius",
  "Morocco",
  "Mozambique",
  "Namibia",
  "Nigeria",
  "Rwanda",
  "Senegal",
  "Seychelles",
  "Tanzania",
  "Tunisia",
  "Uganda",
  "Zambia",
  "Zimbabwe",
];

export const OTHER_COUNTRIES = [
  "Argentina", "Australia", "Austria", "Bangladesh", "Belgium", "Brazil",
  "Bulgaria", "Canada", "Chile", "China", "Colombia", "Croatia", "Cyprus",
  "Czechia", "Denmark", "Estonia", "Finland", "France", "Germany", "Greece",
  "Hong Kong SAR China", "Hungary", "Iceland", "India", "Indonesia", "Ireland",
  "Israel", "Italy", "Japan", "Jordan", "Latvia", "Lithuania", "Luxembourg",
  "Malaysia", "Malta", "Mexico", "Netherlands", "New Zealand", "Norway",
  "Pakistan", "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania",
  "Saudi Arabia", "Serbia", "Singapore", "Slovakia", "Slovenia", "South Korea",
  "Spain", "Sri Lanka", "Sweden", "Switzerland", "Thailand", "Türkiye",
  "Ukraine", "United Arab Emirates", "United Kingdom", "United States",
  "Uruguay", "Vietnam",
].sort((a, b) => a.localeCompare(b, "en-GB"));

export function CountrySelect({
  value,
  onChange,
  id,
  disabled,
  placeholder = "Select…",
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  const known =
    !value || AFRICAN_COUNTRIES.includes(value) || OTHER_COUNTRIES.includes(value);

  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {/* A value captured before this became a dropdown stays selectable
          rather than silently resetting to blank. */}
      {!known && <option value={value}>{value}</option>}
      <optgroup label="Africa">
        {AFRICAN_COUNTRIES.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </optgroup>
      <optgroup label="Rest of the world">
        {OTHER_COUNTRIES.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </optgroup>
    </select>
  );
}

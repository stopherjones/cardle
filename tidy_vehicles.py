import json
import re

INPUT_FILE = "vehicles.json"
OUTPUT_FILE = "vehicles_clean.json"

def clean_model_name(model_str):
    """
    Strips brackets, engine sizes, drivetrains, and trim tiers 
    to leave a clean base model name for the user interface.
    """
    if not model_str:
        return "Unknown"

    # 1. Strip out text inside parentheses or square brackets
    cleaned = re.sub(r'\(.*?\)|\[.*?\]', '', model_str)
    
    # 2. Normalise punctuation and spacing
    cleaned = re.sub(r'[-–—_+,./]', ' ', cleaned)

    # 3. Strip common marketing, trim, and drivetrain suffixes
    strip_patterns = [
        r'\b(?:AWD|4WD|RWD|FWD|4x4|4motion|xDrive|quattro|V6|V8|V12|TDI|BiTurbo|Supercharged|Injection)\b',
        r'\b(?:Hybrid|PHEV|MHEV|EV|E-Tech|Electric|Turbo)\b',
        r'\b(?:GTI|GTR|GTB|GTS|GTx|GTE|RS|R\.S\.|SRT|ST|S-Line|ST-Line|Type-R|VTEC|Evo(?:lution)?|Sport|Line|Pack|Spec|Edition\s*\d*)\b',
        r'\b(?:Coupe|Saloon|Sedan|Convertible|Cabriolet|Roadster|Touring|Estate|Avant|Spyder|Hard\s*Top|Prototype|Vision|Concept)\b',
        r'\b(?:Automatic|Manual|Active|Classic)\b'
    ]
    
    for pattern in strip_patterns:
        cleaned = re.sub(pattern, '', cleaned, flags=re.IGNORECASE)
        
    # 4. Remove standard engine displacements (e.g., 1.6, 2.0, 3.5)
    cleaned = re.sub(r'\b\d\.\d[tT]?\b', '', cleaned)
    
    # 5. Collapse duplicate spaces down to single spaces
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    
    return cleaned if cleaned else model_str.strip()

def process_vehicle_data():
    try:
        with open(INPUT_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"Error: Could not locate source file '{INPUT_FILE}'.")
        return

    valid_entries = []
    
    # Pre-parse and validate years to ensure reliable chronological sorting
    for entry in data:
        try:
            entry['_parsed_year'] = int(entry.get('Year', 0))
            valid_entries.append(entry)
        except (ValueError, TypeError):
            continue  # Discard entries missing a parseable year

    # Step 1: Sort the entire dataset chronologically (oldest to newest)
    valid_entries.sort(key=lambda x: x['_parsed_year'])

    cleaned_database = []
    seen_urls = set()
    
    # Step 2: Deduplicate by URL group
    for entry in valid_entries:
        url = entry.get('url', '').strip().lower()
        make = entry.get('Make', 'Unknown').strip()
        original_model = entry.get('Model', '')
        
        # Fallback security: If an entry lacks a URL, generate a unique key 
        # based on Make + Model so it doesn't accidentally collapse with other blank entries.
        if not url:
            dedup_key = f"no-url-{make.lower()}-{original_model.lower()}"
        else:
            dedup_key = url

        # Because the dataset is pre-sorted chronologically, the first time 
        # a URL key is encountered, it is guaranteed to be the earliest entry.
        if dedup_key not in seen_urls:
            seen_urls.add(dedup_key)
            
            # Apply text tidying to the model name of the surviving entry
            entry['Model'] = clean_model_name(original_model)
            
            # Remove the temporary integer sorting key before saving
            del entry['_parsed_year']
            
            cleaned_database.append(entry)

    # Step 3: Final structural sort (Alphabetical by Make, then Chronological by Year)
    # This keeps the output file highly readable for human auditing
    cleaned_database.sort(key=lambda x: (x.get('Make', ''), x.get('Year', 0)))

    # Step 4: Human-readable output generation (4-space tabs and explicit linebreaks)
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(cleaned_database, f, indent=4, ensure_ascii=False)
        
    print(f"URL-based filtering complete.")
    print(f"Original records: {len(data)} -> Earliest URL variants retained: {len(cleaned_database)}")

if __name__ == "__main__":
    process_vehicle_data()
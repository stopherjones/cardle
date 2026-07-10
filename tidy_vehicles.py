import json
import re

INPUT_FILE = "vehicles.json"
OUTPUT_FILE = "vehicles_clean.json"

def clean_model_name(model_str):
    """
    Aggressively strips text in brackets, engine specs, drivetrains, 
    and trim tiers to isolate the absolute base model name.
    """
    if not model_str:
        return "Unknown"

    # 1. Strip out everything inside parentheses or square brackets immediately
    # (e.g., deletes chassis codes like '(964)' or factory designations)
    cleaned = re.sub(r'\(.*?\)|\[.*?\]', '', model_str)
    
    # 2. Standardise punctuation and spacing to avoid regex boundary misses
    cleaned = re.sub(r'[-–—_+,./]', ' ', cleaned)

    # 3. Aggressive list of suffixes, trims, and configurations to wipe out
    strip_patterns = [
        # Drivetrains & Engines
        r'\b(?:AWD|4WD|RWD|FWD|4x4|4motion|xDrive|quattro|V6|V8|V12|TDI|BiTurbo|Supercharged|Injection)\b',
        # Powertrains & Propulsion
        r'\b(?:Hybrid|PHEV|MHEV|EV|E-Tech|Electric|Turbo)\b',
        # Common Performance & Trim Designations
        r'\b(?:GTI|GTR|GTB|GTS|GTx|GTE|RS|R\.S\.|SRT|ST|S-Line|ST-Line|Type-R|VTEC|Evo(?:lution)?|Sport|Line|Pack|Spec|Edition\s*\d*)\b',
        # Body Styles & Marketing Terms
        r'\b(?:Coupe|Saloon|Sedan|Convertible|Cabriolet|Roadster|Touring|Estate|Avant|Spyder|Hard\s*Top|Prototype|Vision|Concept)\b',
        # Common Transmission/Spec references
        r'\b(?:Automatic|Manual|Active|Classic)\b'
    ]
    
    for pattern in strip_patterns:
        cleaned = re.sub(pattern, '', cleaned, flags=re.IGNORECASE)
        
    # 4. Remove standard engine displacements (e.g., 1.6, 2.0, 3.5, 4.2)
    cleaned = re.sub(r'\b\d\.\d[tT]?\b', '', cleaned)
    
    # 5. Collapse duplicate spaces down to single spaces
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    
    # Fallback protection: if the model was named purely after a trim, return original
    return cleaned if cleaned else model_str.strip()

def process_vehicle_data():
    try:
        with open(INPUT_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"Error: Could not locate source file '{INPUT_FILE}'.")
        return

    cleaned_database = []
    # Set to track unique combinations of (Make, CleanedModel, Decade)
    seen_combinations = set()

    for entry in data:
        make = entry.get('Make', 'Unknown').strip()
        original_model = entry.get('Model', '')
        year = entry.get('Year')
        
        # Calculate the historical decade bucket (e.g., 1974 -> 1970, 2023 -> 2020)
        try:
            year_int = int(year)
            decade = (year_int // 10) * 10
        except (ValueError, TypeError):
            continue  # Discard items missing a parseable number entry
            
        # Isolate the base model name
        cleaned_model = clean_model_name(original_model)
        
        # Create a lowercase composite key to catch identical entries across the same decade
        composite_key = (make.lower(), cleaned_model.lower(), decade)
        
        if composite_key not in seen_combinations:
            seen_combinations.add(composite_key)
            
            # Rewrite the model attribute to the simplified base name for clean UI display
            entry['Model'] = cleaned_model
            cleaned_database.append(entry)

    # Sort the resulting data array chronologically to keep the file ordered
    cleaned_database.sort(key=lambda x: (x.get('Make'), x.get('Year')))

    # Output the simplified dataset with spacing and line breaks
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(cleaned_database, f, indent=4, ensure_ascii=False)
        
    print(f"Aggressive reduction complete.")
    print(f"Original entries: {len(data)} -> Cleaned base entries: {len(cleaned_database)}")

if __name__ == "__main__":
    process_vehicle_data()
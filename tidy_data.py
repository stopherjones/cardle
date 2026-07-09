import json
import re

# Path configurations
INPUT_FILE = "query.json"
OUTPUT_FILE = "data/cars_clean.json"

def clean_make(make_str):
    """Removes heavy corporate suffixes from car brand names."""
    if not make_str:
        return "Unknown"
    # Strip common corporate designations to keep the guessing terms neat
    make_str = re.sub(r'\b(Motor Company|Automobile|Cars|AG|GmbH|plc|Motors|Corp|Corporation)\b', '', make_str, flags=re.IGNORECASE)
    return make_str.strip()

def clean_model(model_str, make_str):
    """Strips the manufacturer prefix if it repeats inside the model label."""
    if not model_str:
        return "Unknown"
    
    model_clean = model_str.strip()
    make_clean = make_str.strip()
    
    # If the model starts with the exact brand name, strip it away
    if model_clean.lower().startswith(make_clean.lower()):
        model_clean = model_clean[len(make_clean):].strip()
        
    # Remove any stray leading dashes, hyphens or spaces left behind
    model_clean = re.sub(r'^[-–—\s]+', '', model_clean)
    
    # Fallback to original string if the cleaning routine empties the model field completely
    return model_clean if model_clean else model_str.strip()

def process_database():
    try:
        with open(INPUT_FILE, 'r', encoding='utf-8') as f:
            raw_data = json.load(f)
            
        cleaned_registry = {}
        
        for item in raw_data:
            # 1. Year Extraction & Validation
            # Ensuring a valid number exists for the higher/lower game logic
            year_str = item.get('year')
            if not year_str:
                continue
            try:
                year_int = int(year_str)
            except ValueError:
                continue  # Skip entries with unparseable non-numeric year data
                
            # 2. Key Identification
            qid = item.get('car', '').split('/')[-1]
            if not qid or not item.get('carLabel') or item.get('carLabel').startswith('Q'):
                continue
                
            # Normalise string attributes
            raw_make = item.get('manufacturerLabel', 'Unknown')
            processed_make = clean_make(raw_make)
            processed_model = clean_model(item.get('carLabel'), processed_make)
            country = item.get('countryLabel', 'Unknown').strip()
            image_url = item.get('image', '').strip()
            
            # 3. Deduplication Loop
            if qid not in cleaned_registry:
                cleaned_registry[qid] = {
                    "id": qid,
                    "make": processed_make,
                    "model": processed_model,
                    "country": country,
                    "year": year_int,
                    "image": image_url
                }
            else:
                # Merge multiple country nodes cleanly if they exist
                existing_countries = cleaned_registry[qid]["country"].split(" / ")
                if country not in existing_countries and country != "Unknown":
                    cleaned_registry[qid]["country"] += f" / {country}"
                    
        # Transform map collection back into a standard list array
        output_list = list(cleaned_registry.values())
        
        # Sort chronologically by production year to improve human review
        output_list.sort(key=lambda x: x['year'])
        
        # 4. Human Readable Output Generation
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as out_f:
            json.dump(output_list, out_f, indent=2, ensure_ascii=False)
            
        print(f"Refinement complete. Total records reduced from {len(raw_data)} to {len(output_list)} clean rows.")
        print(f"Formatted output written cleanly to: {OUTPUT_FILE}")
        
    except FileNotFoundError:
        print(f"Error: Could not locate the raw source file '{INPUT_FILE}'. Check your file location path.")

if __name__ == "__main__":
    process_database()
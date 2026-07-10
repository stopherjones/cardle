import json
import re

INPUT_FILE = "vehicles.json"
OUTPUT_FILE = "vehicles_clean.json"

def clean_model_name(model_str):
    """
    Strips away engine sizes, drivetrains, and redundant trim indicators
    while leaving core models and generational suffixes intact.
    """
    cleaned = model_str

    # 1. Strip engine displacements (e.g., 1.5, 1.6, 2.0T, 2.8, 3.2, 1.5T)
    cleaned = re.sub(r'\b\d\.\d[tT]?(?:\s*TSI|\s*T-GDI)?\b', '', cleaned)
    
    # 2. Strip specific engine configurations and electric capacities
    cleaned = re.sub(r'\b(?:V6|V8|V12|TDI|PHEV|Hybrid|EcoBlue|65kWh|289|350)\b', '', cleaned, flags=re.IGNORECASE)
    
    # 3. Strip drivetrain configurations
    cleaned = re.sub(r'\b(?:AWD|4WD|RWD|4MOTION|xDrive)\b', '', cleaned, flags=re.IGNORECASE)
    
    # 4. Strip generic body/spec text that doesn't define a unique model line
    cleaned = re.sub(r'\b(?:Saloon|Touring|Hard Top|Injection|Automatic)\b', '', cleaned, flags=re.IGNORECASE)
    
    # 5. Convert numeric spec names like '740d' or '520d' to just '740' or '520'
    cleaned = re.sub(r'\b(\d{3})[di]\b', r'\1', cleaned, flags=re.IGNORECASE)

    # 6. Clean up trailing/double spaces left behind by deletions
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    
    # Fallback to prevent accidental empty strings if a name was purely trim-based
    return cleaned if cleaned else model_str

def should_keep_variant(existing_entries, new_entry, cleaned_model):
    """
    Determines if an entry is a notable variant or a separate generation,
    rather than just a duplicate trim line.
    """
    for existing in existing_entries:
        # If the years are more than 6 years apart, it's highly likely a different generation
        if abs(existing['Year'] - new_entry['Year']) > 6:
            return True
        
        # If one is explicitly an EV or high-performance distinct line, keep it
        # (e.g. 'Mustang' vs 'Mustang Mach-E', or 'Evija' vs 'Evija X')
        existing_clean = clean_model_name(existing['Model']).lower()
        if cleaned_model.lower() != existing_clean:
            return True
            
    return False

def process_vehicle_data():
    try:
        with open(INPUT_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"Error: Could not find {INPUT_FILE}. Ensure the script is in the correct directory.")
        return

    cleaned_database = []
    # Track items using a composite key: (Make, BaseCleanedModel) -> list of kept entries
    registry = {}

    for entry in data:
        make = entry.get('Make', 'Unknown')
        original_model = entry.get('Model', '')
        
        # Get the simplified core name
        base_model = clean_model_name(original_model)
        registry_key = (make, base_model)

        if registry_key not in registry:
            # First time seeing this make/model combination, always keep it
            # Update the model name to the cleaned version for consistency
            entry['Model'] = base_model
            registry[registry_key] = [entry]
            cleaned_database.append(entry)
        else:
            # We have seen this base model before. Check if this instance is distinct enough
            if should_keep_variant(registry[registry_key], entry, base_model):
                entry['Model'] = base_model
                registry[registry_key].append(entry)
                cleaned_database.append(entry)

    # Save the deduplicated dataset
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(cleaned_database, f, indent=4, ensure_ascii=False)
        
    print(f"Processing complete! Reduced dataset from {len(data)} down to {len(cleaned_database)} unique entries.")

if __name__ == "__main__":
    process_vehicle_data()
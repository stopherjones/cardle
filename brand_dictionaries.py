import pandas as pd
import re

# 1. Map brands to their respective countries
brand_countries = {
    "Porsche": "Germany",
    "Renault": "France",
    "McMurtry": "UK",
    "Aston Martin": "UK",
    "Peugeot": "France",
    "Audi": "Germany",
    "Rimac": "Croatia",
    "Volkswagen": "Germany",
    "Automobili Pininfarina": "Italy",
    "Koenigsegg": "Sweden",
    "Zenvo": "Denmark",
    "Alfa Romeo": "Italy",
    "De Tomaso": "Italy",
    "Land Rover": "UK",
    "Range Rover": "UK",
    "Scuderia Cameron Glickenhaus": "USA",
    "Opel": "Germany",
    "W Motors": "UAE",
    # Add more as you discover them in your dataset
}

# 2. Map your explicit multi-word brand constraints and text cleanups
brand_transformations = {
    "Land Rover Range Rover": "Range Rover",
    "Vauxhall Opel": "Opel",
    "Alfa Romeo": "Alfa Romeo",
    "Aston Martin": "Aston Martin",
    "Automobili Pininfarina": "Automobili Pininfarina",
    "De Tomaso": "De Tomaso",
    "Land Rover": "Land Rover",
    "Scuderia Cameron Glickenhaus": "Scuderia Cameron Glickenhaus",
    "W Motors": "W Motors"
}

def parse_car_line(line):
    line = str(line).strip()
    
    # Extract trailing 4-digit year
    year_match = re.search(r'\s+(\d{4})$', line)
    if not year_match:
        return None
        
    year = year_match.group(1)
    text_remaining = line[:year_match.start()].strip()
    
    # Process multi-word rules
    matched_prefix = None
    final_brand = None
    
    for pattern in sorted(brand_transformations.keys(), key=len, reverse=True):
        if text_remaining.startswith(pattern):
            matched_prefix = pattern
            final_brand = brand_transformations[pattern]
            break
            
    if matched_prefix:
        brand = final_brand
        model = text_remaining[len(matched_prefix):].strip()
    else:
        # Default fallback: Split at first space
        parts = text_remaining.split(" ", 1)
        brand = parts[0]
        model = parts[1] if len(parts) > 1 else ""
    
    # Fetch country from dictionary, defaulting to "Unknown" if missing
    country = brand_countries.get(brand, "Unknown")
        
    return {"Make": brand, "Model": model, "Year": year, "Country": country}

def main():
    print("Reading 'vehicles.csv'...")
    df = pd.read_csv("vehicles.csv", header=None)
    
    raw_car_lines = df.iloc[::9, 0].dropna().tolist()
    
    cleaned_records = []
    for line in raw_car_lines:
        parsed = parse_car_line(line)
        if parsed:
            cleaned_records.append(parsed)
            
    output_df = pd.DataFrame(cleaned_records)
    
    # Reorder columns to put Country right next to Make
    output_df = output_df[["Make", "Country", "Model", "Year"]]
    
    output_filename = "topdrives_with_countries.csv"
    output_df.to_csv(output_filename, index=False, encoding="utf-8-sig")
    print(f"Process complete! Output saved to: {output_filename}")

if __name__ == "__main__":
    main()
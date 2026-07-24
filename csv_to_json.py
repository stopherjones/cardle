import csv
import json

def convert_cardle_csv_to_json(input_file='cardle.csv', output_file='cardle.json'):
    formatted_data = []

    with open(input_file, mode='r', encoding='utf-8') as file:
        reader = csv.DictReader(file)
        
        for row in reader:
            # Create a case-insensitive lookup dictionary for the row
            row_normalized = {k.strip().lower(): v for k, v in row.items() if k}

            # Safely parse the year
            raw_year = row_normalized.get('year', row_normalized.get('start_year', '')).strip()
            year_value = int(raw_year) if raw_year.isdigit() else None

            # Construct record matching target JSON format
            record = {
                "Make": row_normalized.get('make', '').strip(),
                "Country": row_normalized.get('country', '').strip(),
                "Model": row_normalized.get('model', '').strip(),
                "Year": year_value,
                "url": row_normalized.get('url', '').strip(),
                "imageurl": row_normalized.get('imageurl', row_normalized.get('image_url', '')).strip(),
                "notes": row_normalized.get('notes', '').strip()
            }
            formatted_data.append(record)

    # Export to JSON
    with open(output_file, mode='w', encoding='utf-8') as json_file:
        json.dump(formatted_data, json_file, indent=4, ensure_ascii=False)

    print(f"Successfully converted {len(formatted_data)} records to {output_file}")

if __name__ == '__main__':
    convert_cardle_csv_to_json()
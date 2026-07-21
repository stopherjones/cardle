import csv
import json

def convert_cardle_csv_to_json(input_file='cardle.csv', output_file='cardle.json'):
    formatted_data = []

    with open(input_file, mode='r', encoding='utf-8') as file:
        reader = csv.DictReader(file, delimiter=',')
        
        for row in reader:
            # Safely parse the year as an integer if present
            raw_year = row.get('start_year', '').strip()
            year_value = int(raw_year) if raw_year.isdigit() else None

            # Construct record matching target JSON format
            record = {
                "Make": row.get('make', '').strip(),
                "Country": row.get('country', '').strip(),
                "Model": row.get('model', '').strip(),
                "Year": year_value,
                "url": row.get('URL', '').strip(),
                "imageurl": row.get('image_url', '').strip()
            }
            formatted_data.append(record)

    # Export to JSON
    with open(output_file, mode='w', encoding='utf-8') as json_file:
        json.dump(formatted_data, json_file, indent=4, ensure_ascii=False)

    print(f"Successfully converted {len(formatted_data)} records to {output_file}")

if __name__ == '__main__':
    convert_cardle_csv_to_json()
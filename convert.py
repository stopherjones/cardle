import json
import time
import requests

def fetch_wikipedia_data(search_term):
    """
    Queries the Wikipedia API for a search term and returns the 
    page URL and the main original image URL if found.
    """
    url = "https://en.wikipedia.org/w/api.php"
    headers = {
        "User-Agent": "VehicleDataConverter/1.0 (contact: your_email@example.com)"
    }
    params = {
        "action": "query",
        "generator": "search",
        "gsrsearch": search_term,
        "gsrlimit": "1",
        "prop": "pageimages|info",
        "inprop": "url",
        "piprop": "thumbnail", 
        "pithumbsize": "900",
        "format": "json"
    }
    
    try:
        response = requests.get(url, headers=headers, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        if "query" in data and "pages" in data["query"]:
            pages = data["query"]["pages"]
            page_id = list(pages.keys())[0]
            page_info = pages[page_id]
            
            wiki_url = page_info.get("fullurl", "")
            image_url = page_info.get("thumbnail", {}).get("source", "")
            
            return wiki_url, image_url
            
    except Exception as e:
        print(f"Error fetching data for '{search_term}': {e}")
        
    return "", ""

def update_existing_json(json_file):
    # Try to load the existing JSON file
    try:
        with open(json_file, mode='r', encoding='utf-8') as f:
            vehicles_list = json.load(f)
    except FileNotFoundError:
        print(f"Error: The file '{json_file}' could not be found.")
        return
    except json.JSONDecodeError:
        print(f"Error: '{json_file}' does not appear to be valid JSON.")
        return

    print(f"Loaded {len(vehicles_list)} entries from '{json_file}'. Analysing data...")
    updated_count = 0

    for row in vehicles_list:
        # Normalise strings and extract keys safely
        make = str(row.get('Make', '')).strip()
        model = str(row.get('Model', '')).strip()
        search_term = f"{make} {model}".strip()
        
        # Ensure the keys exist in the dictionary
        if 'url' not in row:
            row['url'] = ""
        if 'imageurl' not in row:
            row['imageurl'] = ""
            
        # Only query Wikipedia if the fields are currently empty
        if search_term and (not row['url'] or not row['imageurl']):
            print(f"Updating missing data for: {search_term}")
            wiki_url, image_url = fetch_wikipedia_data(search_term)
    
            # Only update if the current field is empty
            if wiki_url and not row['url']:
                row['url'] = wiki_url
            if image_url and not row['imageurl']:
                row['imageurl'] = image_url
                
            updated_count += 1
            time.sleep(0.5)  # Courteous delay for API rate limits

    # Save the updated data back into the original file
    with open(json_file, mode='w', encoding='utf-8') as f:
        json.dump(vehicles_list, f, indent=4, ensure_ascii=False)

    print(f"\nProcessing complete. Updated {updated_count} records directly in '{json_file}'.")

if __name__ == "__main__":
    update_existing_json('vehicles.json')
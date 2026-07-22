import csv
import json
import os
from google import genai
from google.genai import types
from pydantic import BaseModel, Field


# 1. Define the exact schema structure required
class CarData(BaseModel):
    Make: str
    Country: str
    Model: str
    Year: int = Field(
        description="The introductory or single representative production year"
    )
    url: str = Field(
        description="Direct URL to the main English Wikipedia article for this car"
    )
    imageurl: str = Field(
        description="Direct URL to a representative Wikimedia Commons image for this car"
    )
    notes: str = Field(
        description="One short sentence explaining why this car is significant"
    )


# 2. Function to load car list from CSV
def load_cars_from_csv(file_path: str) -> list[dict]:
    cars = []
    with open(file_path, mode="r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("Make") and row.get("Model"):
                cars.append(
                    {
                        "Make": row["Make"].strip(),
                        "Model": row["Model"].strip(),
                    }
                )
    return cars


# 3. Initialise the Gemini client
client = genai.Client()


def process_car_list(cars: list[dict]) -> list[dict]:
    output_data = []

    for car in cars:
        prompt = f"Provide historical metadata for: {car['Make']} {car['Model']}."

        try:
            response = client.models.generate_content(
                model="gemini-flash-latest",
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=CarData,
                ),
            )

            car_entry = json.loads(response.text)
            output_data.append(car_entry)
            print(
                f"✓ Added: {car_entry['Make']} {car_entry['Model']} ({car_entry['Year']})"
            )

        except Exception as e:
            print(f"✗ Failed to process {car['Make']} {car['Model']}: {e}")

    return output_data


if __name__ == "__main__":
    input_csv = "new_vehicles.csv"
    output_json = "new_vehicles.json"

    if not os.path.exists(input_csv):
        print(
            f"Error: Could not find '{input_csv}'. Please ensure the file exists in this directory."
        )
    else:
        # Read from CSV, process with Gemini API, and write to JSON
        input_cars = load_cars_from_csv(input_csv)
        print(f"Loaded {len(input_cars)} vehicles from {input_csv}...\n")

        enriched_cars = process_car_list(input_cars)

        with open(output_json, "w", encoding="utf-8") as f:
            json.dump(enriched_cars, f, indent=4, ensure_ascii=False)

        print(f"\nSaved {len(enriched_cars)} entries to {output_json}")
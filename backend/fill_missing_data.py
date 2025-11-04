import os
import pandas as pd

DATA_DIR = os.path.join(os.path.dirname(__file__), "data", "uploads")
RAW_CSV  = os.path.join(DATA_DIR, "ACN-data.csv")
FILLED_CSV = os.path.join(DATA_DIR, "ACN-data-filled.csv")

def fill_missing_values(input_path=RAW_CSV, output_path=FILLED_CSV):
    """
    Reads the flattened ACN-data.csv and forward-fills missing values
    (propagates last non-null values until new ones appear).

    Creates a new file 'ACN-data-filled.csv' with filled values.
    """
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"File not found: {input_path}")

    df = pd.read_csv(input_path)

    # Report before filling
    print(f"Original rows: {len(df)}, columns: {len(df.columns)}")
    print(f"Missing values before fill: {int(df.isna().sum().sum())}")

    # Forward-fill (propagate last non-null values)
    df = df.ffill()

    # Save new CSV
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    df.to_csv(output_path, index=False)

    print(f"✅ Filled CSV saved to {output_path}")
    print(f"Missing values after fill: {int(df.isna().sum().sum())}")
    return df

if __name__ == "__main__":
    fill_missing_values()

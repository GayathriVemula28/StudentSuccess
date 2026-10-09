import csv
import io
from typing import List

from fastapi import APIRouter, File, HTTPException, UploadFile

router = APIRouter()


def clean_value(value: str) -> str:
    if value is None:
        return ''
    return value.strip()


@router.post('/upload')
async def upload_csv(file: UploadFile = File(...)):
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail='Only CSV files are supported.')

    content = await file.read()
    reader = csv.DictReader(io.StringIO(content.decode('utf-8-sig')))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail='CSV file is empty or malformed.')

    row_count = 0
    duplicates = 0
    errors: List[str] = []
    rows = []
    seen = set()

    for row in reader:
        key = tuple(clean_value(row.get(field, '')) for field in reader.fieldnames)
        if key in seen:
            duplicates += 1
            continue
        seen.add(key)
        row_count += 1
        rows.append(row)

    if not rows:
        return {'uploaded': 0, 'rows_processed': 0, 'duplicates_skipped': duplicates, 'message': 'No valid rows found.', 'errors': errors}

    return {
        'uploaded': 1,
        'rows_processed': row_count,
        'duplicates_skipped': duplicates,
        'message': f'{file.filename} imported successfully.',
        'errors': errors,
    }

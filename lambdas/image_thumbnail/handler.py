"""Creates a JPEG thumbnail for every product image uploaded to S3.

Triggered by s3:ObjectCreated on the product image prefix. Thumbnails are written
under a separate prefix, so they never trigger this function again.
"""

import io
import logging
import os
import posixpath
import urllib.parse

import boto3
from PIL import Image, ImageOps, UnidentifiedImageError

THUMBNAIL_SIZE = (300, 300)
JPEG_QUALITY = 85
MAX_SOURCE_BYTES = 5 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 25_000_000
ALLOWED_FORMATS = {"PNG", "JPEG"}

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3 = boto3.client("s3")


def _load_config() -> dict[str, str]:
    path = f"/order-platform/{os.environ['APP_ENV']}/shared"
    ssm = boto3.client("ssm")
    values: dict[str, str] = {}
    for page in ssm.get_paginator("get_parameters_by_path").paginate(Path=path):
        for param in page["Parameters"]:
            values[param["Name"].removeprefix(f"{path}/")] = param["Value"]
    missing = {"s3-product-image-prefix", "s3-thumbnail-prefix"} - values.keys()
    if missing:
        raise RuntimeError(f"Missing SSM parameters under {path}: {sorted(missing)}")
    return values


_config = _load_config()
IMAGE_PREFIX = _config["s3-product-image-prefix"]
THUMBNAIL_PREFIX = _config["s3-thumbnail-prefix"]


def thumbnail_key(image_key: str) -> str:
    """Must match thumbnailKeyOf in the backend (product-images.ts)."""
    stem, _ = posixpath.splitext(image_key)
    return f"{THUMBNAIL_PREFIX}{stem}.jpg"


def make_thumbnail(data: bytes) -> bytes:
    with Image.open(io.BytesIO(data)) as image:
        if image.format not in ALLOWED_FORMATS:
            raise ValueError(f"unsupported format {image.format}")
        image = ImageOps.exif_transpose(image)
        image.thumbnail(THUMBNAIL_SIZE)
        if image.mode in ("RGBA", "LA", "P"):
            image = image.convert("RGBA")
            background = Image.new("RGB", image.size, (255, 255, 255))
            background.paste(image, mask=image.getchannel("A"))
            image = background
        elif image.mode != "RGB":
            image = image.convert("RGB")
        output = io.BytesIO()
        image.save(output, format="JPEG", quality=JPEG_QUALITY, optimize=True)
        return output.getvalue()


def process(bucket: str, key: str, size: int) -> None:
    if not key.startswith(IMAGE_PREFIX) or key.startswith(THUMBNAIL_PREFIX):
        logger.warning("Skipping %s: outside the product image prefix", key)
        return
    if size > MAX_SOURCE_BYTES:
        logger.warning("Skipping %s: %d bytes exceeds the limit", key, size)
        return

    body = s3.get_object(Bucket=bucket, Key=key)["Body"].read(MAX_SOURCE_BYTES + 1)
    if len(body) > MAX_SOURCE_BYTES:
        logger.warning("Skipping %s: larger than the limit", key)
        return

    try:
        thumbnail = make_thumbnail(body)
    except (UnidentifiedImageError, Image.DecompressionBombError, ValueError, OSError) as error:
        logger.warning("Skipping %s: not a usable image (%s)", key, error)
        return

    target = thumbnail_key(key)
    s3.put_object(
        Bucket=bucket,
        Key=target,
        Body=thumbnail,
        ContentType="image/jpeg",
        CacheControl="public, max-age=31536000, immutable",
    )
    logger.info("Thumbnail written to s3://%s/%s (%d bytes)", bucket, target, len(thumbnail))


def handler(event, _context):
    for record in event.get("Records", []):
        s3_info = record["s3"]
        process(
            bucket=s3_info["bucket"]["name"],
            key=urllib.parse.unquote_plus(s3_info["object"]["key"]),
            size=int(s3_info["object"].get("size", 0)),
        )

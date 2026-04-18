import os
import json
import math
import boto3
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

bedrock = boto3.client("bedrock-runtime", region_name="us-west-2")

GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")

# -----------------------------
# Existing Bedrock chat route
# -----------------------------
@app.route("/ask", methods=["POST"])
def ask():
    try:
        body = request.json or {}

        response = bedrock.invoke_model(
            modelId="anthropic.claude-sonnet-4-5",
            contentType="application/json",
            accept="application/json",
            body=json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 1000,
                "messages": body.get("messages", [])
            })
        )

        result = json.loads(response["body"].read())
        return jsonify(result)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# -----------------------------
# Helpers
# -----------------------------
def geocode_location(location_text):
    if not GOOGLE_MAPS_API_KEY:
        raise ValueError("Missing GOOGLE_MAPS_API_KEY environment variable.")

    url = "https://maps.googleapis.com/maps/api/geocode/json"
    params = {
        "address": location_text,
        "key": GOOGLE_MAPS_API_KEY
    }

    res = requests.get(url, params=params, timeout=20)
    res.raise_for_status()
    data = res.json()

    if data.get("status") != "OK" or not data.get("results"):
        raise ValueError("Could not find that location.")

    result = data["results"][0]
    loc = result["geometry"]["location"]

    return {
        "formatted_address": result["formatted_address"],
        "lat": loc["lat"],
        "lng": loc["lng"]
    }


def miles_to_meters(miles):
    return int(float(miles) * 1609.34)


def search_nearby_hikes(lat, lng, radius_meters):
    if not GOOGLE_MAPS_API_KEY:
        raise ValueError("Missing GOOGLE_MAPS_API_KEY environment variable.")

    # Places API Nearby Search
    url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"

    # We search for hiking related locations.
    # Google is not perfect here, so we do keyword-based search.
    params = {
        "location": f"{lat},{lng}",
        "radius": radius_meters,
        "keyword": "hiking trail",
        "key": GOOGLE_MAPS_API_KEY
    }

    res = requests.get(url, params=params, timeout=20)
    res.raise_for_status()
    data = res.json()

    if data.get("status") not in ["OK", "ZERO_RESULTS"]:
        raise ValueError(f"Places API error: {data.get('status')}")

    hikes = []
    for place in data.get("results", []):
        hikes.append({
            "id": place.get("place_id"),
            "name": place.get("name"),
            "address": place.get("vicinity", ""),
            "rating": place.get("rating"),
            "user_ratings_total": place.get("user_ratings_total"),
            "lat": place["geometry"]["location"]["lat"],
            "lng": place["geometry"]["location"]["lng"],
            "types": place.get("types", []),
            "photo_reference": place.get("photos", [{}])[0].get("photo_reference") if place.get("photos") else None
        })

    return hikes


def rank_hikes_with_bedrock(quiz_answers, location_text, radius_miles, hikes):
    if not hikes:
        return []

    prompt = f"""
You are a hiking recommendation assistant.

A user took a hiking personality quiz. Use their quiz answers to rank the best nearby hikes.

User location: {location_text}
Search radius: {radius_miles} miles

Quiz answers:
{json.dumps(quiz_answers, indent=2)}

Nearby hikes:
{json.dumps(hikes[:15], indent=2)}

Task:
Return ONLY valid JSON as an array of the best hikes, ranked from best to worst.
Pick up to 8.
For each result include:
- id
- name
- address
- short_reason
- vibe_match
- difficulty_guess
- rating
- user_ratings_total
- lat
- lng
- photo_reference

Do not use markdown.
"""

    response = bedrock.invoke_model(
        modelId="anthropic.claude-sonnet-4-5",
        contentType="application/json",
        accept="application/json",
        body=json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 1500,
            "messages": [
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        })
    )

    result = json.loads(response["body"].read())

    text = ""
    for item in result.get("content", []):
        if item.get("type") == "text":
            text += item.get("text", "")

    cleaned = text.replace("```json", "").replace("```", "").strip()

    return json.loads(cleaned)


def attach_photo_urls(hikes):
    enriched = []
    for hike in hikes:
        photo_ref = hike.get("photo_reference")
        if photo_ref and GOOGLE_MAPS_API_KEY:
            hike["photo_url"] = (
                "https://maps.googleapis.com/maps/api/place/photo"
                f"?maxwidth=800&photo_reference={photo_ref}&key={GOOGLE_MAPS_API_KEY}"
            )
        else:
            hike["photo_url"] = None
        enriched.append(hike)
    return enriched


# -----------------------------
# New route for real hike search
# -----------------------------
@app.route("/find-hikes", methods=["POST"])
def find_hikes():
    try:
        body = request.json or {}

        location_text = body.get("location", "").strip()
        radius_miles = body.get("radius", 10)
        quiz_answers = body.get("answers", {})

        if not location_text:
            return jsonify({"error": "Location is required."}), 400

        geo = geocode_location(location_text)
        radius_meters = miles_to_meters(radius_miles)

        raw_hikes = search_nearby_hikes(geo["lat"], geo["lng"], radius_meters)

        # Fallback if Bedrock ranking fails
        ranked_hikes = raw_hikes

        if raw_hikes:
            try:
                ranked_hikes = rank_hikes_with_bedrock(
                    quiz_answers=quiz_answers,
                    location_text=geo["formatted_address"],
                    radius_miles=radius_miles,
                    hikes=raw_hikes
                )
            except Exception as ranking_error:
                print("Bedrock ranking failed, using raw nearby results:", ranking_error)

        ranked_hikes = attach_photo_urls(ranked_hikes)

        return jsonify({
            "location": geo["formatted_address"],
            "radius_miles": radius_miles,
            "count": len(ranked_hikes),
            "hikes": ranked_hikes
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    print("🥾 Hike Quiz server running at http://localhost:5001")
    app.run(port=5001, debug=True)

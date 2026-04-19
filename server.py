import boto3
import json
from flask import Flask, request, jsonify
from flask_cors import CORS
from geopy.geocoders import Nominatim

app = Flask(__name__)
CORS(app)

client = boto3.client('bedrock-runtime', region_name='us-west-2')
geolocator = Nominatim(user_agent="trailmatch_app")


@app.route('/ask', methods=['POST'])
def ask():
    try:
        body = request.json

        response = client.invoke_model(
            modelId='anthropic.claude-sonnet-4-5',
            contentType='application/json',
            accept='application/json',
            body=json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 1000,
                "messages": body.get("messages", [])
            })
        )

        result = json.loads(response['body'].read())
        return jsonify(result)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


def build_search_terms(answers, location):
    environment = answers.get("1")
    fitness = answers.get("2")
    scenery = answers.get("3")
    vibe = answers.get("5")

    terms = []

    if environment == "forest":
        terms.append(f"forest hiking trail near {location}")
    elif environment == "mountain":
        terms.append(f"mountain hiking trail near {location}")
    elif environment == "beach":
        terms.append(f"coastal hiking trail near {location}")
    elif environment == "desert":
        terms.append(f"desert hiking trail near {location}")

    if scenery == "water":
        terms.append(f"waterfall hiking trail near {location}")
    elif scenery == "views":
        terms.append(f"scenic viewpoint hiking trail near {location}")
    elif scenery == "wildlife":
        terms.append(f"wildlife nature trail near {location}")
    elif scenery == "flowers":
        terms.append(f"wildflower hiking trail near {location}")

    if vibe == "peaceful":
        terms.append(f"quiet nature trail near {location}")
    elif vibe == "adventure":
        terms.append(f"challenging hiking trail near {location}")
    elif vibe == "scenic":
        terms.append(f"scenic hiking trail near {location}")
    elif vibe == "discovery":
        terms.append(f"hidden gem hiking trail near {location}")

    if fitness == "beginner":
        terms.append(f"easy hiking trail near {location}")
    elif fitness == "moderate":
        terms.append(f"moderate hiking trail near {location}")
    elif fitness == "advanced":
        terms.append(f"hard hiking trail near {location}")
    elif fitness == "expert":
        terms.append(f"expert hiking trail near {location}")

    seen = set()
    clean_terms = []
    for term in terms:
        if term not in seen:
            clean_terms.append(term)
            seen.add(term)

    return clean_terms[:6]


def search_trails_from_answers(answers, location, radius):
    search_terms = build_search_terms(answers, location)
    found = []
    seen_addresses = set()

    try:
        radius_miles = int(radius)
    except Exception:
        radius_miles = 10

    limit_per_search = 3 if radius_miles <= 10 else 4

    for term in search_terms:
        results = geolocator.geocode(term, exactly_one=False, limit=limit_per_search)

        if not results:
            continue

        for r in results:
            address = r.address
            if address in seen_addresses:
                continue

            seen_addresses.add(address)

            name = address.split(",")[0].strip()

            found.append({
                "id": address.lower().replace(" ", "-").replace(",", ""),
                "name": name,
                "tagline": f"Found near {location}",
                "tags": ["trail search", f"{radius_miles} mile radius"],
                "desc": address,
                "emoji": "🥾",
                "lat": r.latitude,
                "lng": r.longitude,
                "maps_url": f"https://www.google.com/maps/search/?api=1&query={r.latitude},{r.longitude}"
            })

    return found[:8]


def build_analysis_with_bedrock(answers, location, radius):
    labels = {
        "1": {
            "forest": "forest lover",
            "mountain": "mountain person",
            "beach": "coastal explorer",
            "desert": "desert wanderer"
        },
        "2": {
            "beginner": "beginner hiker",
            "moderate": "moderate hiker",
            "advanced": "advanced hiker",
            "expert": "expert hiker"
        },
        "3": {
            "wildlife": "wildlife and birds",
            "views": "panoramic views",
            "water": "waterfalls and rivers",
            "flowers": "wildflowers and meadows"
        },
        "4": {
            "solo": "usually hikes solo",
            "partner": "likes hiking with a partner or friend",
            "group": "enjoys hiking with a group"
        },
        "5": {
            "adventure": "wants adventure",
            "peaceful": "wants peace and quiet",
            "scenic": "wants scenic beauty",
            "discovery": "wants exploration and hidden gems"
        }
    }

    profile = {
        "environment": labels["1"].get(answers.get("1"), ""),
        "fitness": labels["2"].get(answers.get("2"), ""),
        "scenery": labels["3"].get(answers.get("3"), ""),
        "social": labels["4"].get(answers.get("4"), ""),
        "vibe": labels["5"].get(answers.get("5"), ""),
        "location": location,
        "radius": f"{radius} miles"
    }

    prompt = f"""
Write a short hiking personality analysis in 3 to 4 sentences.

User profile:
{json.dumps(profile, indent=2)}

Style:
- warm
- natural
- slightly poetic
- do not sound robotic
- do not use bullet points
"""

    response = client.invoke_model(
        modelId='anthropic.claude-sonnet-4-5',
        contentType='application/json',
        accept='application/json',
        body=json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 300,
            "messages": [
                {"role": "user", "content": prompt}
            ]
        })
    )

    result = json.loads(response['body'].read())
    text_parts = [item.get("text", "") for item in result.get("content", []) if item.get("type") == "text"]
    return "".join(text_parts).strip()


@app.route('/quiz-results', methods=['POST'])
def quiz_results():
    try:
        body = request.json or {}
        answers = body.get("answers", {})
        location = body.get("location", "").strip()
        radius = body.get("radius", 10)

        if len(answers.keys()) < 5:
            return jsonify({"error": "Missing quiz answers"}), 400

        if not location:
            return jsonify({"error": "Missing location"}), 400

        # fallback analysis first, so we always have something
        analysis = (
            f"You seem like someone who wants a trail that matches your mood, pace, and scenery preferences. "
            f"Based on your answers, you're probably looking for a hike near {location} that feels personal and worth the trip."
        )

        # try Bedrock analysis, but do not fail the whole route if it breaks
        try:
            analysis = build_analysis_with_bedrock(answers, location, radius) or analysis
        except Exception as bedrock_error:
            print("Bedrock analysis failed:", bedrock_error)

        trails = search_trails_from_answers(answers, location, radius)

        return jsonify({
            "analysis": analysis,
            "trails": trails
        })

    except Exception as e:
        print("quiz_results route failed:", e)
        return jsonify({
            "analysis": "You seem drawn to trails that match your energy, scenery preferences, and hiking style.",
            "trails": [],
            "error": str(e)
        }), 500

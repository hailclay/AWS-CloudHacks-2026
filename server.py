import boto3
import json
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

client = boto3.client('bedrock-runtime', region_name='us-west-2')

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

if __name__ == '__main__':
    print("🥾 Hike Quiz server running at http://localhost:5001")
    app.run(port=5001, debug=True)


#!/bin/bash
# seed-trails.sh
#
# Uploads the trail seed data to S3 after your first `sam deploy`.
# Run this once to populate the trails dataset.
#
# Usage:
#   chmod +x scripts/seed-trails.sh
#   ./scripts/seed-trails.sh
#
# The bucket name is output by `sam deploy` — copy it from the Outputs section
# or find it in the AWS console under S3.

# Get the bucket name from the CloudFormation stack output
BUCKET=$(aws cloudformation describe-stacks \
  --stack-name trailmatch-backend \
  --query "Stacks[0].Outputs[?OutputKey=='TrailsBucketName'].OutputValue" \
  --output text)

if [ -z "$BUCKET" ]; then
  echo "Error: Could not find bucket name. Make sure you've run 'sam deploy' first."
  exit 1
fi

echo "Uploading trail data to s3://$BUCKET/data/trails.json ..."
aws s3 cp data/trails.json "s3://$BUCKET/data/trails.json" \
  --content-type "application/json"

echo "Done! Trail data is live."
echo ""
echo "Your API URL:"
aws cloudformation describe-stacks \
  --stack-name trailmatch-backend \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" \
  --output text

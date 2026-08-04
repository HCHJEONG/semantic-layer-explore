#!/usr/bin/env bash
set -euo pipefail
export AWS_REGION="ap-northeast-2"
export AWS_PAGER=""

VPC_ID="vpc-0fe3bdf72e5770098"
INSTANCE_ID="i-0fa95bb4eff77caf2"
INSTANCE_SG="sg-07975091c78ba134c"
ALB_SG="sg-0f5c0f92460020c68"
ALB_ARN="arn:aws:elasticloadbalancing:ap-northeast-2:767397926940:loadbalancer/app/penvot-internet-facing-1/b2f39551179d8e8b"
LISTENER_ARN="arn:aws:elasticloadbalancing:ap-northeast-2:767397926940:listener/app/penvot-internet-facing-1/b2f39551179d8e8b/44fa4d83b9cb53ba"
HOSTED_ZONE_ID="Z0744879U9IEPS407YFW"
HOSTNAME="ai-workspace.sampoongapt.com"
TARGET_GROUP_NAME="ai-workspace-3010"

echo "[1/5] Target Group"
TARGET_GROUP_ARN=$(aws elbv2 describe-target-groups --names "${TARGET_GROUP_NAME}" --query 'TargetGroups[0].TargetGroupArn' --output text 2>/dev/null || true)
if [[ -z "${TARGET_GROUP_ARN}" || "${TARGET_GROUP_ARN}" == "None" ]]; then
  TARGET_GROUP_ARN=$(aws elbv2 create-target-group \
    --name "${TARGET_GROUP_NAME}" --protocol HTTP --port 3010 --vpc-id "${VPC_ID}" --target-type instance \
    --health-check-protocol HTTP --health-check-path /api/health --health-check-interval-seconds 30 \
    --health-check-timeout-seconds 5 --healthy-threshold-count 2 --unhealthy-threshold-count 3 \
    --matcher HttpCode=200-399 --query 'TargetGroups[0].TargetGroupArn' --output text)
fi
aws elbv2 register-targets --target-group-arn "${TARGET_GROUP_ARN}" --targets "Id=${INSTANCE_ID},Port=3010"

echo "[2/5] EC2 Security Group"
SG_RULE_COUNT=$(aws ec2 describe-security-groups --group-ids "${INSTANCE_SG}" --output json | jq \
  --arg alb "${ALB_SG}" '[.SecurityGroups[0].IpPermissions[] | select(.IpProtocol=="tcp" and .FromPort==3010 and .ToPort==3010) | .UserIdGroupPairs[]? | select(.GroupId==$alb)] | length')
if [[ "${SG_RULE_COUNT}" == "0" ]]; then
  aws ec2 authorize-security-group-ingress --group-id "${INSTANCE_SG}" --ip-permissions \
    "IpProtocol=tcp,FromPort=3010,ToPort=3010,UserIdGroupPairs=[{GroupId=${ALB_SG},Description=AI-Workspace-from-ALB}]"
fi

echo "[3/5] HTTPS Listener rule"
RULES_JSON=$(aws elbv2 describe-rules --listener-arn "${LISTENER_ARN}" --output json)
AI_RULE_ARN=$(jq -r --arg host "${HOSTNAME}" '.Rules[] | select(any(.Conditions[]?.Values[]?; . == $host)) | .RuleArn' <<<"${RULES_JSON}" | head -n 1)
if [[ -z "${AI_RULE_ARN}" ]]; then
  if jq -e '.Rules[] | select(.Priority == "1")' >/dev/null <<<"${RULES_JSON}"; then
    mapfile -t SHIFTED_PRIORITIES < <(jq -r '.Rules[] | select(.Priority != "default") | "RuleArn=\(.RuleArn),Priority=\((.Priority|tonumber)+1)"' <<<"${RULES_JSON}")
    HIGHEST_PRIORITY=$(jq -r '[.Rules[].Priority | select(. != "default") | tonumber] | max' <<<"${RULES_JSON}")
    (( HIGHEST_PRIORITY < 50000 )) || { echo "Cannot shift Listener priorities above 50000"; exit 1; }
    aws elbv2 set-rule-priorities --rule-priorities "${SHIFTED_PRIORITIES[@]}" >/dev/null
  fi
  AI_RULE_ARN=$(aws elbv2 create-rule --listener-arn "${LISTENER_ARN}" --priority 1 \
    --conditions "Field=host-header,HostHeaderConfig={Values=[${HOSTNAME}]}" \
    --actions "Type=forward,TargetGroupArn=${TARGET_GROUP_ARN}" \
    --query 'Rules[0].RuleArn' --output text)
else
  aws elbv2 modify-rule --rule-arn "${AI_RULE_ARN}" \
    --conditions "Field=host-header,HostHeaderConfig={Values=[${HOSTNAME}]}" \
    --actions "Type=forward,TargetGroupArn=${TARGET_GROUP_ARN}" >/dev/null
fi

echo "[4/5] Route 53 alias"
ALB_DNS=$(aws elbv2 describe-load-balancers --load-balancer-arns "${ALB_ARN}" --query 'LoadBalancers[0].DNSName' --output text)
ALB_ZONE_ID=$(aws elbv2 describe-load-balancers --load-balancer-arns "${ALB_ARN}" --query 'LoadBalancers[0].CanonicalHostedZoneId' --output text)
CHANGE_FILE=$(mktemp)
trap 'rm -f "${CHANGE_FILE}"' EXIT
jq -n --arg name "${HOSTNAME}" --arg dns "${ALB_DNS}" --arg zone "${ALB_ZONE_ID}" '{
  Comment:"AI Physical Workspace public alias",
  Changes:[{Action:"UPSERT",ResourceRecordSet:{Name:$name,Type:"A",AliasTarget:{HostedZoneId:$zone,DNSName:$dns,EvaluateTargetHealth:true}}}]
}' > "${CHANGE_FILE}"
aws route53 change-resource-record-sets --hosted-zone-id "${HOSTED_ZONE_ID}" --change-batch "file://${CHANGE_FILE}" >/dev/null

echo "[5/5] Verification"
aws elbv2 describe-target-health --target-group-arn "${TARGET_GROUP_ARN}" --output table
echo "Configured: https://${HOSTNAME}"
echo "If the container is not running yet, target health remains unused/unhealthy until deploy.sh completes."

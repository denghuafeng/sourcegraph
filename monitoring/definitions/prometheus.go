package definitions

import (
	"github.com/sourcegraph/sourcegraph/monitoring/definitions/shared"
	"github.com/sourcegraph/sourcegraph/monitoring/monitoring"
)

func Prometheus() *monitoring.Container {
	return &monitoring.Container{
		Name:        "prometheus",
		Title:       "Prometheus",
		Description: "Sourcegraph's all-in-one Prometheus and Alertmanager service.",
		Groups: []monitoring.Group{
			{
				Title: "Metrics",
				Rows: []monitoring.Row{
					{
						{
							Name:              "prometheus_metrics_bloat",
							Description:       "prometheus metrics payload size",
							Query:             `http_response_size_bytes{handler="prometheus",job!="kubernetes-apiservers",job!="kubernetes-nodes",quantile="0.5"}`,
							DataMayNotExist:   true,
							Warning:           monitoring.Alert().GreaterOrEqual(20000),
							PanelOptions:      monitoring.PanelOptions().Unit(monitoring.Bytes).LegendFormat("{{instance}}"),
							Owner:             monitoring.ObservableOwnerDistribution,
							PossibleSolutions: "none",
						},
					},
				},
			},
			{
				Title: "Alerts",
				Rows: []monitoring.Row{
					{
						{
							Name:              "alertmanager_notifications_failed_total",
							Description:       "failed alertmanager notifications over 1m",
							Query:             `sum by(integration) (rate(alertmanager_notifications_failed_total[1m]))`,
							DataMayNotExist:   true,
							Warning:           monitoring.Alert().GreaterOrEqual(1),
							PanelOptions:      monitoring.PanelOptions().LegendFormat("{{integration}}"),
							Owner:             monitoring.ObservableOwnerDistribution,
							PossibleSolutions: "Ensure that your [`observability.alerts` configuration](https://docs.sourcegraph.com/admin/observability/alerting#setting-up-alerting) (in site configuration) is valid.",
						},
					},
				},
			},
			{
				Title:  "Container monitoring (not available on server)",
				Hidden: true,
				Rows: []monitoring.Row{
					{
						shared.ContainerCPUUsage("prometheus", monitoring.ObservableOwnerDistribution),
						shared.ContainerMemoryUsage("prometheus", monitoring.ObservableOwnerDistribution),
					},
					{
						shared.ContainerRestarts("prometheus", monitoring.ObservableOwnerDistribution),
						shared.ContainerFsInodes("prometheus", monitoring.ObservableOwnerDistribution),
					},
				},
			},
			{
				Title:  "Provisioning indicators (not available on server)",
				Hidden: true,
				Rows: []monitoring.Row{
					{
						shared.ProvisioningCPUUsageLongTerm("prometheus", monitoring.ObservableOwnerDistribution),
						shared.ProvisioningMemoryUsageLongTerm("prometheus", monitoring.ObservableOwnerDistribution),
					},
					{
						shared.ProvisioningCPUUsageShortTerm("prometheus", monitoring.ObservableOwnerDistribution),
						shared.ProvisioningMemoryUsageShortTerm("prometheus", monitoring.ObservableOwnerDistribution),
					},
				},
			},
			{
				Title:  "Kubernetes monitoring (ignore if using Docker Compose or server)",
				Hidden: true,
				Rows: []monitoring.Row{
					{
						shared.KubernetesPodsAvailable("prometheus", monitoring.ObservableOwnerDistribution),
					},
				},
			},
		},
	}
}

import pluginId from './pluginId';

export default {
  register(app) {
    app.addMenuLink({
      to: `/plugins/${pluginId}`,
      icon: () => '📊', // Simple emoji icon
      intlLabel: {
        id: `${pluginId}.plugin.name`,
        defaultMessage: 'CSV Import',
      },
      Component: () => import('./components/PluginPage'),
      permissions: [],
    });

    app.registerPlugin({
      id: pluginId,
      name: pluginId,
    });
  },

  bootstrap() {},
};